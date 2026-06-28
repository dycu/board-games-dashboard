import { Game } from '../types'
import { formatTimeAgo } from './utils'

const API = 'https://api.choochoo.games'
const BASE = 'https://www.choochoo.games'

export async function fetchChoochoo(username: string, password: string): Promise<Game[]> {
  // Step 1: get XSRF token from body + session cookie
  const xsrfRes = await fetch(`${API}/api/xsrf`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
  })
  const xsrfJson = await xsrfRes.json() as any
  const xsrfToken: string = xsrfJson.xsrfToken ?? ''
  const setCookies: string[] = (xsrfRes.headers as any).getSetCookie?.() ?? []
  const rawCookie = setCookies[0] ?? xsrfRes.headers.get('set-cookie') ?? ''
  const xsrfCookie = rawCookie.split(';')[0]
  if (!xsrfToken) throw new Error(`choochoo: no xsrf token (xsrf status=${xsrfRes.status} body=${JSON.stringify(xsrfJson).slice(0,100)})`)
  if (!xsrfCookie) throw new Error(`choochoo: no session cookie after xsrf (setCookies=${setCookies.length} raw=${rawCookie.slice(0,80)})`)

  // Step 2: login at /api/users/login with session cookie + xsrf-token header
  const loginRes = await fetch(`${API}/api/users/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'xsrf-token': xsrfToken,
      Cookie: xsrfCookie,
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ usernameOrEmail: username, password }),
  })
  const loginBody = await loginRes.text()
  let loginJson: any
  try { loginJson = JSON.parse(loginBody) } catch { loginJson = {} }
  if (!loginJson.user) throw new Error(`choochoo: login failed (status=${loginRes.status} body=${loginBody.slice(0,150)})`)

  const myUserId: number = loginJson.user.id
  const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? xsrfCookie

  // Step 3: fetch active games (status[] must be array format; userId filters by owner so we filter locally instead)
  const gamesRes = await fetch(`${API}/api/games?status[]=ACTIVE&pageSize=20`, {
    headers: { Accept: 'application/json', Cookie: authCookie, 'User-Agent': 'Mozilla/5.0' },
  })
  if (!gamesRes.ok) throw new Error(`choochoo.games games fetch failed: HTTP ${gamesRes.status}`)
  const gamesJson = await gamesRes.json() as any
  const allGames: any[] = gamesJson.games ?? (Array.isArray(gamesJson) ? gamesJson : [])
  const games = allGames.filter((g: any) => Array.isArray(g.playerIds) && g.playerIds.includes(myUserId))

  return games.map((g: any): Game => {
    const gameId = g.id ?? 0
    const isMyTurn = g.activePlayerId === myUserId
    const otherPlayerIds: number[] = (g.playerIds ?? []).filter((id: number) => id !== myUserId)
    const lastMoveAt = g.updatedAt ? new Date(g.updatedAt) : new Date()

    return {
      id: `choochoo:${gameId}`,
      platform: 'choochoo',
      gameName: g.name ?? g.gameKey ?? g.title ?? 'Unknown',
      myTurn: isMyTurn,
      currentPlayer: undefined,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl: `${BASE}/app/games/${gameId}`,
      platformUrl: `${BASE}/app/games`,
      players: otherPlayerIds.map(String),
    }
  })
}
