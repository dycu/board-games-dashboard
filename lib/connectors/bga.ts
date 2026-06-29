import { Game, FinishedGame } from '../types'
import { formatTimeRemaining, formatTimeAgo } from './utils'

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

function cookieString(cookies: Record<string, string>): string {
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

async function fetchGameNames(slugs: string[], cookies: Record<string, string>): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  // Fetch in small batches with a gap to avoid triggering BGA rate-limiting.
  // Firing all slugs in parallel (20+ concurrent requests) causes intermittent
  // 429/503s; the immediate retry then hits the same window and also fails.
  const BATCH = 4
  const BATCH_DELAY_MS = 200
  const TIMEOUT_MS = 8000

  async function fetchOne(slug: string): Promise<[string, string]> {
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
          // the attribute and handles apostrophes (e.g. "Andromeda's Edge") correctly
          if (!res.ok) continue
          const html = await res.text()
          const m = html.match(/content="Play ([^"]+?) online from your browser"/i)
          if (m) return [slug, decodeHtmlEntities(m[1].replace(/\s+/g, ' ').trim())]
        } finally {
          clearTimeout(tid)
        }
      } catch {
        // network error, timeout, or abort; retry once
      }
    }
    return [slug, slug]
  }

  for (let i = 0; i < slugs.length; i += BATCH) {
    if (i > 0) await new Promise<void>(r => setTimeout(r, BATCH_DELAY_MS))
    const batch = slugs.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(fetchOne))
    for (const [slug, name] of results) map.set(slug, name)
  }

  return map
}

export async function fetchBGA(username: string, password: string, capDays = 3): Promise<Game[]> {
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
    throw new Error(`BGA: could not extract request_token. Hex strings found in page: [${hexFound.join(', ') || 'none'}]`)
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

  // Step 4: fetch active in-progress async games via tablemanager
  const tablesRes = await fetch(`${BASE}/tablemanager/tablemanager/tableinfos.html`, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/json, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': postLoginToken,
      Origin: BASE,
      Referer: `${BASE}/gameinprogress`,
      Cookie: cookieString(allCookies),
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
  const tables = Object.values(rawTables)


  // Step 5: resolve display names from gamepanel pages (game_name field is a URL slug)
  const uniqueSlugs = [...new Set(tables.map((t: any) => t.game_name as string).filter(Boolean))]
  const nameMap = uniqueSlugs.length > 0 ? await fetchGameNames(uniqueSlugs, allCookies) : new Map<string, string>()

  return tables.map((t: any): Game => {
    const players: Record<string, any> = t.players ?? {}
    const myPlayer = players[myId]
    const isMyTurn = myPlayer?.myturn === '1' || myPlayer?.myturn === 1

    // active player = whichever player has myturn=1
    const activePlayerEntry = Object.values(players).find((p: any) => p.myturn === '1' || p.myturn === 1) as any

    // think_limit   = Unix timestamp (seconds) of the active player's deadline
    // think_seconds = think_limit − now  (remaining seconds; negative = overtime)
    // BGA doesn't expose last-move time, so we show time remaining instead
    const thinkLimitSec = t.think_limit != null ? parseInt(t.think_limit) : null
    const thinkRemainSec = activePlayerEntry?.think_seconds != null
      ? parseInt(activePlayerEntry.think_seconds)
      : null
    const hasTimingData = thinkLimitSec != null && !isNaN(thinkLimitSec)
      && thinkRemainSec != null && !isNaN(thinkRemainSec)
    // BGA's bank is cumulative so we can't derive actual last-move time.
    // Use capDays as a fixed horizon: remaining < cap → some urgency; remaining > cap → "just now".
    const capMs = capDays * 86400 * 1000
    const lastMoveAt = hasTimingData
      ? new Date(Date.now() - Math.max(0, capMs - thinkRemainSec! * 1000))
      : new Date()

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
      lastMoveAgo: hasTimingData && thinkRemainSec! < capDays * 86400
        ? formatTimeRemaining(thinkRemainSec!)
        : '–',
      urgent: hasTimingData && thinkRemainSec! < 24 * 3600,
      gameUrl: `${BASE}/${t.gameserver}/${t.game_name}?table=${t.id}`,
      platformUrl: `${BASE}/gameinprogress`,
      players: playerNames,
    }
  })
}

export async function fetchFinishedBGA(username: string, password: string): Promise<FinishedGame[]> {
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

  const loginPageRes = await fetch(`${loginBase}/?page=login`, {
    headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*', Cookie: cookieString(cookies) },
  })
  cookies = { ...cookies, ...parseCookies(loginPageRes.headers) }
  const loginPageHtml = await loginPageRes.text()
  const requestToken = extractRequestToken(loginPageHtml)
  if (!requestToken) throw new Error(`BGA: could not extract request_token`)

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
  try { loginData = JSON.parse(loginText) } catch {
    throw new Error(`BGA login HTTP ${loginRes.status}: ${loginText.slice(0, 300)}`)
  }
  if (loginData.status !== 1) throw new Error(`BGA login failed: ${loginData.error ?? JSON.stringify(loginData)}`)

  const allCookies = { ...cookies, ...parseCookies(loginRes.headers) }
  const myId = String(loginData.data?.user_id ?? loginData.data?.id ?? '')
  const postLoginToken = allCookies['TournoiEnLigneidt'] ?? allCookies['TournoiEnLigneid'] ?? ''
  if (!postLoginToken) throw new Error(`BGA: no request token in login response cookies`)

  // gamestats/getGames returns full game history without DB timeouts (unlike tablemanager status=finished)
  const gamesRes = await fetch(`${BASE}/gamestats/gamestats/getGames.html?player=${myId}&updateStats=0`, {
    headers: {
      ...BROWSER_HEADERS,
      Accept: 'application/json, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': postLoginToken,
      Origin: BASE,
      Referer: `${BASE}/gamestats?player=${myId}`,
      Cookie: cookieString(allCookies),
    },
  })

  const gamesText = await gamesRes.text()
  let gamesData: any
  try { gamesData = JSON.parse(gamesText) } catch {
    throw new Error(`BGA gamestats HTTP ${gamesRes.status}: ${gamesText.slice(0, 300)}`)
  }
  if (gamesData.status !== 1) throw new Error(`BGA gamestats failed: ${JSON.stringify(gamesData).slice(0, 400)}`)

  const tables: any[] = gamesData?.data?.tables ?? []

  // Response comes newest-first; take the 50 most recent
  return tables.slice(0, 50).map((t: any): FinishedGame => {
    const endSec = t.end != null ? parseInt(t.end) : null
    const completedAt = endSec && !isNaN(endSec) ? new Date(endSec * 1000) : new Date()

    return {
      id: `bga:${t.table_id}`,
      platform: 'bga',
      gameName: t.game_name ?? 'Unknown',
      completedAt,
      completedAgo: formatTimeAgo(completedAt),
      gameUrl: `${BASE}/table?table=${t.table_id}`,
    }
  })
}
