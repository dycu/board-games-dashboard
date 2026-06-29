import { Game } from '../types'
import { formatTimeAgo, formatTimeRemaining } from './utils'

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

// BGA's gamepanel og:title is "Play {Game Name} online from your browser"
// The title can span multiple lines in the HTML, so we use [\s\S] instead of .
async function fetchGameNames(slugs: string[], cookies: Record<string, string>): Promise<Map<string, string>> {
  const pairs = await Promise.all(
    slugs.map(async (slug): Promise<[string, string]> => {
      try {
        const res = await fetch(`https://en.boardgamearena.com/gamepanel?game=${slug}`, {
          headers: { ...BROWSER_HEADERS, Cookie: cookieString(cookies) },
        })
        const html = await res.text()
        // BGA always uses double-quote delimiters on og:title, so [^"] stays inside
        // the attribute and handles apostrophes (e.g. "Andromeda's Edge") correctly
        const m = html.match(/content="Play ([^"]+?) online from your browser"/i)
        return [slug, m ? decodeHtmlEntities(m[1].replace(/\s+/g, ' ').trim()) : slug]
      } catch {
        return [slug, slug]
      }
    })
  )
  return new Map(pairs)
}

export async function fetchBGA(username: string, password: string): Promise<Game[]> {
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

  // TEMPORARY DEBUG — remove once we've identified useful timing fields
  if (tables.length > 0) {
    const sample = tables[0] as any
    console.log('[BGA debug] table keys:', Object.keys(sample).sort().join(', '))
    const samplePlayer = Object.values(sample.players ?? {})[0] as any
    if (samplePlayer) console.log('[BGA debug] player keys:', Object.keys(samplePlayer).sort().join(', '))
    console.log('[BGA debug] sample table (timing fields):', JSON.stringify({
      think_limit: sample.think_limit,
      start_thinking: sample.start_thinking,
      date: sample.date,
      date_update: sample.date_update,
      updated_at: sample.updated_at,
      last_move_at: sample.last_move_at,
      move_date: sample.move_date,
      active_since: sample.active_since,
    }))
    if (samplePlayer) console.log('[BGA debug] sample player (timing fields):', JSON.stringify({
      think_seconds: samplePlayer.think_seconds,
      start_thinking: samplePlayer.start_thinking,
      think_start: samplePlayer.think_start,
      begin_thinking: samplePlayer.begin_thinking,
      move_date: samplePlayer.move_date,
      last_move: samplePlayer.last_move,
    }))
  }

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
    // BGA doesn't expose last-move time; map remaining bank to a fake "age" so BGA
    // games sort alongside other platforms: less time remaining → older lastMoveAt.
    // Using 3-day bank (most common BGA async setting): a freshly-reset bank maps
    // to "just now"; < 3 days remaining ranks proportionally; > 3 days = "just now".
    const MAX_BANK_MS = 3 * 24 * 3600 * 1000
    const lastMoveAt = hasTimingData
      ? new Date(Date.now() - Math.max(0, MAX_BANK_MS - thinkRemainSec! * 1000))
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
      lastMoveAgo: hasTimingData && thinkRemainSec! < 7 * 24 * 3600 ? formatTimeRemaining(thinkRemainSec!) : '–',
      urgent: hasTimingData && thinkRemainSec! < 24 * 3600,
      gameUrl: `${BASE}/${t.gameserver}/${t.game_name}?table=${t.id}`,
      platformUrl: `${BASE}/gameinprogress`,
      players: playerNames,
    }
  })
}
