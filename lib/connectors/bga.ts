import { kv } from '@vercel/kv'
import { Game, FinishedGame } from '../types'
import { formatTimeRemaining, formatTimeAgo } from './utils'
import { getCatalog } from '../catalogs/cache'
import { resolveLastMoves, Seed } from './bgaLastMove'
import { getTables } from '../pace/store'

const BASE = 'https://boardgamearena.com'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

function parseCookies(headers: Headers): Record<string, string> {
  const cookies: Record<string, string> = {}
  const setCookieList = headers.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : [])
  for (const raw of setCookieList) {
    const [kv] = raw.split(';')
    const eq = kv.indexOf('=')
    if (eq > 0) cookies[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim()
  }
  return cookies
}

export function cookieString(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}

function extractRequestToken(html: string): string {
  const m = html.match(/g_requestToken\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/['"]request_token['"]\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/name=['"]request_token['"][^>]*value=['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/\brequestToken['"\s:=,]+([a-f0-9]{64})\b/i)
           ?? html.match(/\brequest_token['"\s:=,]+([a-f0-9]{64})\b/i)
  return m ? m[m.length - 1] : ''
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü',
  ntilde: 'ñ', ccedil: 'ç', szlig: 'ß',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Auml: 'Ä', Aring: 'Å',
  Egrave: 'È', Eacute: 'É', Euml: 'Ë',
  Iacute: 'Í', Ouml: 'Ö', Uacute: 'Ú', Uuml: 'Ü', Ntilde: 'Ñ', Ccedil: 'Ç',
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, e) => HTML_ENTITIES[e] ?? m)
}

// A game's display name never changes, so resolved names are kept in KV
// indefinitely and the ~1.9 MB gamepanel page is only fetched for slugs seen for
// the first time. Slugs whose gamepanel page loads but carries no title (alpha
// games redirect to the /reviewer page) are remembered as unresolved for a day,
// so they aren't refetched on every refresh. Transient failures aren't cached.
const NAME_CACHE_PREFIX = 'bga-game-name:v1:'
const UNRESOLVED_TTL_SECONDS = 86400

type CachedName = { name: string | null }

// og:title sits in the first ~1 KB of a ~1.9 MB game page, so stop reading after </head>
async function readHead(res: Response): Promise<string> {
  if (!res.body) return res.text()
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  while (!html.includes('</head>') && html.length < 200_000) {
    const { done, value } = await reader.read()
    if (done) break
    html += decoder.decode(value, { stream: true })
  }
  reader.cancel().catch(() => {})
  return html
}

// `known` (e.g. catalog names) fills uncached slugs without fetching their pages
async function fetchGameNames(
  slugs: string[],
  cookies: Record<string, string>,
  known?: Map<string, string>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()

  let cached: (CachedName | null)[] = []
  try {
    cached = await kv.mget<(CachedName | null)[]>(...slugs.map(s => NAME_CACHE_PREFIX + s))
  } catch {
    // KV unavailable — resolve everything live
  }
  const missing: string[] = []
  const knownWrites: Promise<unknown>[] = []
  slugs.forEach((slug, i) => {
    const entry = cached[i]
    const knownName = known?.get(slug)
    if (entry) map.set(slug, entry.name ?? slug)
    else if (knownName) {
      map.set(slug, knownName)
      knownWrites.push(kv.set(NAME_CACHE_PREFIX + slug, { name: knownName } satisfies CachedName).catch(() => {}))
    } else missing.push(slug)
  })
  await Promise.all(knownWrites)
  if (missing.length === 0) return map

  // Fetch in small batches with a gap to avoid triggering BGA rate-limiting.
  // Firing all slugs in parallel (20+ concurrent requests) causes intermittent
  // 429/503s; the immediate retry then hits the same window and also fails.
  const BATCH = 4
  const BATCH_DELAY_MS = 200
  const TIMEOUT_MS = 8000

  // string = resolved, null = page loaded without a title, undefined = fetch failed
  async function fetchOne(slug: string): Promise<[string, string | null | undefined]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController()
        const tid = setTimeout(() => controller.abort(), TIMEOUT_MS)
        try {
          const res = await fetch(`https://en.boardgamearena.com/gamepanel?game=${slug}`, {
            headers: { ...BROWSER_HEADERS, Cookie: cookieString(cookies) },
            signal: controller.signal,
          })
          // BGA always uses double-quote delimiters on og:title, so [^"] stays inside
          // the attribute and handles apostrophes (e.g. "Andromeda's Edge") correctly.
          // BGA has used both "online from your browser" and "online on Board Game Arena"
          // wording over time, so match either.
          if (!res.ok) continue
          const html = await readHead(res)
          const m = html.match(/content="Play ([^"]+?) online (?:from your browser|on Board Game Arena)"/i)
          return [slug, m ? decodeHtmlEntities(m[1].replace(/\s+/g, ' ').trim()) : null]
        } finally {
          clearTimeout(tid)
        }
      } catch {
        // network error, timeout, or abort; retry once
      }
    }
    return [slug, undefined]
  }

  const writes: Promise<unknown>[] = []
  for (let i = 0; i < missing.length; i += BATCH) {
    if (i > 0) await new Promise<void>(r => setTimeout(r, BATCH_DELAY_MS))
    const batch = missing.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(fetchOne))
    for (const [slug, name] of results) {
      map.set(slug, name ?? slug)
      if (name === undefined) continue
      const value: CachedName = { name }
      writes.push(
        (name === null
          ? kv.set(NAME_CACHE_PREFIX + slug, value, { ex: UNRESOLVED_TTL_SECONDS })
          : kv.set(NAME_CACHE_PREFIX + slug, value)
        ).catch(() => {}) // caching is best-effort
      )
    }
  }
  await Promise.all(writes)

  return map
}

export interface BgaSession {
  cookies: Record<string, string>
  myId: string
  token: string // X-Request-Token for API calls after login
}

export function bgaApiHeaders(session: BgaSession, referer = `${BASE}/gameinprogress`): Record<string, string> {
  return {
    ...BROWSER_HEADERS,
    Accept: 'application/json, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Request-Token': session.token,
    Origin: BASE,
    Referer: referer,
    Cookie: cookieString(session.cookies),
  }
}

export async function loginBGA(username: string, password: string): Promise<BgaSession> {
  // Step 1: follow redirect from boardgamearena.com to locale subdomain, collect PHPSESSID
  const initRes = await fetch(`${BASE}/account`, {
    redirect: 'manual',
    headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*' },
  })
  let cookies = parseCookies(initRes.headers)
  let loginBase = BASE

  if (initRes.status >= 300 && initRes.status < 400) {
    const location = initRes.headers.get('location') ?? ''
    if (location) {
      const redirectUrl = new URL(location.startsWith('http') ? location : `${BASE}${location}`)
      loginBase = redirectUrl.origin
      const followRes = await fetch(redirectUrl.href, {
        redirect: 'manual',
        headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*', Cookie: cookieString(cookies) },
      })
      cookies = { ...cookies, ...parseCookies(followRes.headers) }
    }
  }

  // Step 2: fetch login page to extract the CSRF request_token embedded in HTML/JS
  const loginPageRes = await fetch(`${loginBase}/?page=login`, {
    headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*', Cookie: cookieString(cookies) },
  })
  cookies = { ...cookies, ...parseCookies(loginPageRes.headers) }
  const loginPageHtml = await loginPageRes.text()
  const requestToken = extractRequestToken(loginPageHtml)

  if (!requestToken) {
    const hexFound = [...loginPageHtml.matchAll(/[a-f0-9]{48,64}/gi)].map(m => m[0]).slice(0, 5)
    // Say what came back instead (a block/challenge page looks different from a changed login page)
    const title = loginPageHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
    const text = loginPageHtml.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
    throw new Error(`BGA: could not extract request_token (HTTP ${loginPageRes.status}, ${loginPageHtml.length} bytes, title "${title}", text "${text}"). Hex strings found in page: [${hexFound.join(', ') || 'none'}]`)
  }

  // Step 3: POST login to locale subdomain
  const loginRes = await fetch(`${loginBase}/account/auth/loginUserWithPassword.html`, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': requestToken,
      Origin: loginBase,
      Referer: `${loginBase}/?step=2&page=login`,
      Cookie: cookieString(cookies),
    },
    body: new URLSearchParams({ username, password, remember_me: 'true', request_token: requestToken }),
  })

  const loginText = await loginRes.text()
  let loginData: any
  try {
    loginData = JSON.parse(loginText)
  } catch {
    throw new Error(`BGA login HTTP ${loginRes.status}: ${loginText.slice(0, 300) || '(empty body)'}`)
  }
  if (loginData.status !== 1) throw new Error(`BGA login failed: ${loginData.error ?? JSON.stringify(loginData)}`)

  const allCookies = { ...cookies, ...parseCookies(loginRes.headers) }
  // Login response uses user_id (not id)
  const myId = String(loginData.data?.user_id ?? loginData.data?.id ?? '')
  // After login BGA sets TournoiEnLigneidt — this is the X-Request-Token for subsequent API calls
  const postLoginToken = allCookies['TournoiEnLigneidt'] ?? allCookies['TournoiEnLigneid'] ?? ''
  if (!postLoginToken) throw new Error(`BGA: no request token in login response cookies (keys: ${Object.keys(allCookies).join(', ')})`)

  return { cookies: allCookies, myId, token: postLoginToken }
}

// Raw in-progress tables, keyed by table id in BGA's response
export async function fetchBgaTables(session: BgaSession): Promise<any[]> {
  const tablesRes = await fetch(`${BASE}/tablemanager/tablemanager/tableinfos.html`, {
    method: 'POST',
    headers: {
      ...bgaApiHeaders(session),
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: 'status=play&turninfo=true',
  })

  const tablesText = await tablesRes.text()
  let tablesData: any
  try {
    tablesData = JSON.parse(tablesText)
  } catch {
    throw new Error(`BGA tables HTTP ${tablesRes.status}: ${tablesText.slice(0, 300)}`)
  }
  if (tablesData.status !== 1) throw new Error(`BGA tables failed: ${tablesData.error ?? JSON.stringify(tablesData).slice(0, 200)}`)

  // tables is an object keyed by table id
  const rawTables: Record<string, any> = tablesData?.data?.tables ?? {}
  return Object.values(rawTables)
}

// Logging in costs ~4 requests including a ~2 MB page, and BGA starts serving
// a login page without a request token when it sees too many logins (hit on
// 2026-10-07 by the Pace backfill re-logging in every round). So one session
// is cached and shared by the dashboard and the Pace sync, and only replaced
// when BGA rejects it. After a failed login, further attempts are refused for
// a while rather than adding to the block.
const SESSION_KV_KEY = 'bga-session:v1'
const SESSION_TTL_SECONDS = 6 * 3600
const LOGIN_COOLDOWN_KEY = 'bga-login-failed:v1'
const LOGIN_COOLDOWN_SECONDS = 15 * 60

// KV is best-effort here: a KV failure must never break fetching games
async function quietly<T>(op: () => Promise<T>): Promise<T | null> {
  try { return await op() } catch { return null }
}

async function freshSession(username: string, password: string, why = ''): Promise<BgaSession> {
  const cooling = await quietly(() => kv.get<string>(LOGIN_COOLDOWN_KEY))
  if (cooling) throw new Error(`BGA login paused after a failed attempt: ${cooling}`)
  try {
    const session = await loginBGA(username, password)
    await quietly(() => kv.set(SESSION_KV_KEY, session, { ex: SESSION_TTL_SECONDS }))
    return session
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400) + (why ? ` [cached session was rejected: ${why}]` : '')
    await quietly(() => kv.set(LOGIN_COOLDOWN_KEY, msg, { ex: LOGIN_COOLDOWN_SECONDS }))
    throw new Error(msg)
  }
}

// Runs fn with the cached session, logging in again once if BGA rejects it
export async function withBgaSession<T>(
  username: string,
  password: string,
  fn: (session: BgaSession) => Promise<T>,
): Promise<T> {
  const cached = await quietly(() => kv.get<BgaSession>(SESSION_KV_KEY))
  let rejection = ''
  if (cached) {
    try {
      return await fn(cached)
    } catch (e) {
      rejection = (e instanceof Error ? e.message : String(e)).slice(0, 200)
      await quietly(() => kv.del(SESSION_KV_KEY))
    }
  }
  // The cooldown message keeps why the cached session was dropped — it's what led to this login
  return fn(await freshSession(username, password, rejection))
}

// table id → Unix seconds of its last move; tables it can't work out are left out
async function fetchLastMoves(session: BgaSession, tables: any[]): Promise<Map<string, number>> {
  try {
    // The Pace sync already tracks each running table's latest packet, so
    // histories never have to be read from the start
    const paceTables = await getTables().catch(() => ({}))
    const seeds: Record<string, Seed> = {}
    for (const [id, p] of Object.entries(paceTables)) {
      if (p.end === null && p.state.lastPacketId > 0) seeds[id] = p.state
    }
    return await resolveLastMoves(
      tables.map(t => ({ id: String(t.id), gameserver: String(t.gameserver), game_name: t.game_name, players: t.players ?? {} })),
      async (t, from) => {
        const res = await fetch(
          `${BASE}/${t.gameserver}/${t.game_name}/${t.game_name}/notificationHistory.html?table=${t.id}&from=${from}&privateinc=1&history=1`,
          { headers: bgaApiHeaders(session) },
        )
        const json = await res.json()
        if (String(json.status) !== '1') throw new Error(`BGA notificationHistory: ${json.error ?? json.status}`)
        return json.data?.data ?? []
      },
      seeds,
    )
  } catch {
    return new Map()
  }
}

// Fallback horizon for the time-bank estimate, used only when a table's history can't be read
const ESTIMATE_CAP_DAYS = 3

export async function fetchBGA(username: string, password: string): Promise<Game[]> {
  const { session, tables } = await withBgaSession(username, password, async s => ({ session: s, tables: await fetchBgaTables(s) }))
  const { myId, cookies: allCookies } = session

  // Step 5: resolve display names from gamepanel pages (game_name field is a URL slug)
  const uniqueSlugs = [...new Set(tables.map((t: any) => t.game_name as string).filter(Boolean))]
  const [nameMap, lastMoves] = await Promise.all([
    uniqueSlugs.length > 0 ? fetchGameNames(uniqueSlugs, allCookies) : new Map<string, string>(),
    fetchLastMoves(session, tables),
  ])

  return tables.map((t: any): Game => {
    const players: Record<string, any> = t.players ?? {}
    const myPlayer = players[myId]
    const isMyTurn = myPlayer?.myturn === '1' || myPlayer?.myturn === 1

    // active player = whichever player has myturn=1. BGA can report myturn=1 on more
    // than one player at once (observed on The Crew — a stale flag left over from
    // the previous player). When it's my turn, my own entry must win so the timing
    // data shown is mine, not some other still-flagged player's.
    const activePlayerEntry = isMyTurn
      ? myPlayer
      : (Object.values(players).find((p: any) => p.myturn === '1' || p.myturn === 1) as any)

    // think_limit   = Unix timestamp (seconds) of the active player's deadline
    // think_seconds = think_limit − now  (remaining seconds; negative = overtime)
    // BGA doesn't expose last-move time, so we show time remaining instead
    const thinkLimitSec = t.think_limit != null ? parseInt(t.think_limit) : null
    const thinkRemainSec = activePlayerEntry?.think_seconds != null
      ? parseInt(activePlayerEntry.think_seconds)
      : null
    const hasTimingData = thinkLimitSec != null && !isNaN(thinkLimitSec)
      && thinkRemainSec != null && !isNaN(thinkRemainSec)
    // The real last-move time comes from the table's history (fetchLastMoves).
    // When that's unavailable, fall back to an estimate from the time bank, which is
    // cumulative so it can't give the real time: ESTIMATE_CAP_DAYS is a fixed horizon,
    // remaining < cap → some urgency; remaining > cap → "just now".
    const realSec = lastMoves.get(String(t.id))
    const capMs = ESTIMATE_CAP_DAYS * 86400 * 1000
    const lastMoveAt = realSec !== undefined
      ? new Date(realSec * 1000)
      : hasTimingData
        ? new Date(Date.now() - Math.max(0, capMs - thinkRemainSec! * 1000))
        : new Date()
    const remaining = hasTimingData && thinkRemainSec! < ESTIMATE_CAP_DAYS * 86400 ? formatTimeRemaining(thinkRemainSec!) : null
    const lastMoveAgo = realSec !== undefined
      // The deadline still matters once it's close
      ? [formatTimeAgo(lastMoveAt), hasTimingData && thinkRemainSec! < 24 * 3600 ? remaining : null].filter(Boolean).join(' · ')
      : remaining ?? '–'

    const playerNames = Object.values(players)
      .map((p: any) => p.fullname)
      .filter((n: string) => n && n !== (myPlayer?.fullname ?? ''))

    return {
      id: `bga:${t.id}`,
      platform: 'bga',
      gameName: nameMap.get(t.game_name) ?? t.game_name ?? 'Unknown',
      myTurn: isMyTurn,
      currentPlayer: isMyTurn ? undefined : (activePlayerEntry?.fullname ?? undefined),
      lastMoveAt,
      lastMoveAgo,
      urgent: hasTimingData && thinkRemainSec! < 24 * 3600,
      gameUrl: `${BASE}/${t.gameserver}/${t.game_name}?table=${t.id}`,
      platformUrl: `${BASE}/gameinprogress`,
      players: playerNames,
    }
  })
}

// gamestats/getGames lists finished tables 10 per page, newest first, without
// the DB timeouts of tableinfos status=finished. Uses the shared cached session:
// a separate login here is what BGA's login rate limit punishes.
const FINISHED_PAGES = 5

export async function fetchFinishedBGA(username: string, password: string): Promise<FinishedGame[]> {
  const { session, rows } = await withBgaSession(username, password, async s => {
    const rows: any[] = []
    for (let page = 1; page <= FINISHED_PAGES; page++) {
      const url = `${BASE}/gamestats/gamestats/getGames.html?player=${s.myId}&opponent_id=0&finished=1&page=${page}&updateStats=0`
      const res = await fetch(url, { headers: bgaApiHeaders(s, `${BASE}/gamestats?player=${s.myId}`) })
      const text = await res.text()
      let json: any
      try { json = JSON.parse(text) } catch {
        throw new Error(`BGA gamestats HTTP ${res.status}: ${text.slice(0, 300)}`)
      }
      if (String(json.status) !== '1') throw new Error(`BGA gamestats failed: ${json.error ?? JSON.stringify(json).slice(0, 300)}`)
      const tables: any[] = json.data?.tables ?? []
      rows.push(...tables)
      if (tables.length < 10) break
    }
    return { session: s, rows }
  })

  const finished = rows.filter(t => t.cancelled !== '1' && t.cancelled !== 1)
  const uniqueSlugs = [...new Set(finished.map((t: any) => t.game_name as string).filter(Boolean))]
  const nameMap = uniqueSlugs.length > 0 ? await fetchGameNames(uniqueSlugs, session.cookies) : new Map<string, string>()

  return finished.map((t: any): FinishedGame => {
    const endSec = t.end != null ? parseInt(t.end) : null
    const completedAt = endSec && !isNaN(endSec) ? new Date(endSec * 1000) : new Date()

    return {
      id: `bga:${t.table_id}`,
      platform: 'bga',
      gameName: nameMap.get(t.game_name) ?? t.game_name ?? 'Unknown',
      completedAt,
      completedAgo: formatTimeAgo(completedAt),
      // /table?table=ID only opens the table lobby (a stripped-down, mobile-style
      // summary page) — the real game module path is needed for the actual desktop
      // replay view, same as fetchBGA's gameUrl. gamestats/getGames doesn't return
      // t.gameserver; prefixing a fake locale segment (e.g. 'en') 404s, so omit the
      // segment entirely when it's missing — /{game_name}?table=ID resolves fine.
      gameUrl: t.gameserver
        ? `${BASE}/${t.gameserver}/${t.game_name}?table=${t.table_id}`
        : `${BASE}/${t.game_name}?table=${t.table_id}`,
    }
  })
}

// Lifetime finished-game count per game. getGames with updateStats=1 adds
// stats.games: one row per game ever played, whose cnt values add up to the
// player's total — unlike the table list, which pages 10 at a time.
export async function fetchBgaPlayTotals(username: string, password: string): Promise<{ slug: string; name: string; plays: number }[]> {
  const { session, rows } = await withBgaSession(username, password, async s => {
    const url = `${BASE}/gamestats/gamestats/getGames.html?player=${s.myId}&opponent_id=0&finished=1&page=1&updateStats=1`
    const res = await fetch(url, { headers: bgaApiHeaders(s, `${BASE}/gamestats?player=${s.myId}`) })
    const text = await res.text()
    let json: any
    try { json = JSON.parse(text) } catch {
      throw new Error(`BGA gamestats HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    if (String(json.status) !== '1') throw new Error(`BGA gamestats failed: ${json.error ?? JSON.stringify(json).slice(0, 300)}`)
    return { session: s, rows: (json.data?.stats?.games ?? []) as any[] }
  })

  const slugs = [...new Set(rows.map(r => r.game_name as string).filter(Boolean))]
  const catalog = await getCatalog('bga').catch(() => [])
  const catalogNames = new Map(catalog.flatMap(e => {
    const slug = new URL(e.url).searchParams.get('game')
    return slug ? [[slug, e.name] as [string, string]] : []
  }))
  const names = slugs.length > 0 ? await fetchGameNames(slugs, session.cookies, catalogNames) : new Map<string, string>()
  return rows
    .filter(r => r.game_name)
    .map(r => ({ slug: r.game_name, name: names.get(r.game_name) ?? r.game_name, plays: Number(r.cnt) || 0 }))
}
