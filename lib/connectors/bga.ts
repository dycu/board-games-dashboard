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

export async function fetchBGA(username: string, password: string): Promise<Game[]> {
  // Step 1: visit login page to get PHPSESSID + TournoiEnLigneid (= requestToken / CSRF token)
  const initRes = await fetch(`${BASE}/account`, {
    redirect: 'manual',
    headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*' },
  })
  let cookies = parseCookies(initRes.headers)

  // BGA redirects /account and sets TournoiEnLigneid on the redirect target.
  // Follow manually so we can pass PHPSESSID along — auto-follow drops intermediate cookies.
  if (initRes.status >= 300 && initRes.status < 400) {
    const location = initRes.headers.get('location') ?? '/account'
    const url = location.startsWith('http') ? location : `${BASE}${location}`
    const followRes = await fetch(url, {
      redirect: 'manual',
      headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*', Cookie: cookieString(cookies) },
    })
    cookies = { ...cookies, ...parseCookies(followRes.headers) }
  }

  const requestToken = cookies['TournoiEnLigneid'] ?? ''
  if (!requestToken) throw new Error('BGA: failed to obtain requestToken from initial page load')

  // Step 2: POST login
  const loginRes = await fetch(`${BASE}/account/account/login.html`, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': requestToken,
      Referer: `${BASE}/account`,
      Cookie: cookieString(cookies),
    },
    body: new URLSearchParams({ email: username, password, rememberme: 'on', redirect: 'studio', requestToken }),
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
  const myId = String(loginData.data?.id ?? '')
  // After login BGA sets TournoiEnLigneidt (note trailing 't') — this is what X-Request-Token must use
  const postLoginToken = allCookies['TournoiEnLigneidt'] ?? allCookies['TournoiEnLigneid'] ?? requestToken

  // Step 3: fetch active tables
  const tablesRes = await fetch(`${BASE}/player/player/getactivetables.html?status=open`, {
    headers: {
      ...BROWSER_HEADERS,
      Accept: 'application/json, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': postLoginToken,
      Cookie: cookieString(allCookies),
    },
  })
  const tablesText = await tablesRes.text()
  let tablesData: any
  try {
    tablesData = JSON.parse(tablesText)
  } catch {
    throw new Error(`BGA tables HTTP ${tablesRes.status}: ${tablesText.slice(0, 300) || '(empty body)'}`)
  }

  const tables: any[] = tablesData?.data?.tables ?? []

  return tables.map((t: any): Game => {
    const lastMoveAt = new Date(t.gameserver_updated * 1000)
    const isMyTurn = String(t.active_player) === myId
    return {
      id: `bga:${t.id}`,
      platform: 'bga',
      gameName: t.game_name ?? 'Unknown',
      myTurn: isMyTurn,
      currentPlayer: isMyTurn ? undefined : t.active_player_name,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl: `${BASE}/table/table/main.html?table=${t.id}`,
      platformUrl: `${BASE}/player`,
      players: (t.players ?? []).map((p: any) => p.name).filter((n: string) => n !== ''),
    }
  })
}
