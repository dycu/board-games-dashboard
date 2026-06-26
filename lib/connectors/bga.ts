import { Game } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://boardgamearena.com'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
}

function extractRequestToken(html: string): string {
  // BGA embeds a CSRF token in the page JS: requestToken: "abc123"
  const match = html.match(/requestToken['":\s]+['"]([a-f0-9]+)['"]/i)
  return match?.[1] ?? ''
}

export async function fetchBGA(username: string, password: string): Promise<Game[]> {
  // Load the login page to get session cookies + CSRF requestToken
  const initRes = await fetch(`${BASE}/account`, {
    headers: { ...BROWSER_HEADERS, 'Accept': 'text/html,application/xhtml+xml,*/*' },
  })
  const initHtml = await initRes.text()
  const rawCookies = initRes.headers.getSetCookie?.() ?? [initRes.headers.get('set-cookie') ?? '']
  const cookieHeader = rawCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ')
  const requestToken = extractRequestToken(initHtml)

  const loginBody = new URLSearchParams({ email: username, password, rememberme: 'on', redirect: 'studio' })
  if (requestToken) loginBody.set('requestToken', requestToken)

  const loginRes = await fetch(`${BASE}/account/account/login.html`, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${BASE}/account`,
      'Cookie': cookieHeader,
    },
    body: loginBody,
  })

  const text = await loginRes.text()
  let loginData: any
  try {
    loginData = JSON.parse(text)
  } catch {
    throw new Error(`BGA login returned unexpected response (HTML instead of JSON — possible bot detection)`)
  }
  if (loginData.status !== 1) throw new Error('BGA login failed: ' + (loginData.error ?? 'unknown'))

  const loginCookies = loginRes.headers.getSetCookie?.() ?? [loginRes.headers.get('set-cookie') ?? '']
  const allCookies = [...rawCookies, ...loginCookies]
  const sessionCookie = allCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ')

  const gamesRes = await fetch(`${BASE}/player/player/getactivetables.html?status=open`, {
    headers: { ...BROWSER_HEADERS, Cookie: sessionCookie },
  })
  const data = await gamesRes.json()

  const myId = String(loginData.data?.id ?? '')
  const tables: any[] = data?.data?.tables ?? []

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
      players: (t.players ?? []).map((p: any) => p.name).filter((n: string) => n !== username),
    }
  })
}
