import { Game } from '../types'
import { formatTimeAgo } from './utils'

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

  return tables.map((t: any): Game => {
    const players: Record<string, any> = t.players ?? {}
    const myPlayer = players[myId]
    const isMyTurn = myPlayer?.myturn === '1' || myPlayer?.myturn === 1

    // active player = whichever player has myturn=1
    const activePlayerEntry = Object.values(players).find((p: any) => p.myturn === '1' || p.myturn === 1) as any

    const thinkSeconds = parseInt(activePlayerEntry?.think_seconds ?? '0') || 0
    const lastMoveAt = thinkSeconds > 0
      ? new Date(Date.now() - thinkSeconds * 1000)
      : new Date()

    const playerNames = Object.values(players)
      .map((p: any) => p.fullname)
      .filter((n: string) => n && n !== (myPlayer?.fullname ?? ''))

    return {
      id: `bga:${t.id}`,
      platform: 'bga',
      gameName: t.game_name ?? 'Unknown',
      myTurn: isMyTurn,
      currentPlayer: isMyTurn ? undefined : (activePlayerEntry?.fullname ?? undefined),
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl: `${BASE}/${t.gameserver}/${t.game_name}?table=${t.id}`,
      platformUrl: `${BASE}/gameinprogress`,
      players: playerNames,
    }
  })
}
