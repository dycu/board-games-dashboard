import { Game } from '../types'
import { formatTimeAgo } from './utils'

const API = 'https://api.choochoo.games'
const BASE = 'https://www.choochoo.games'

async function apiGet(path: string, sessionCookie: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: { Accept: 'application/json', Cookie: sessionCookie, 'User-Agent': 'Mozilla/5.0' },
  })
}

async function apiPost(path: string, sessionCookie: string, xsrfToken: string, body: object): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: sessionCookie,
      'xsrf-token': xsrfToken,
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify(body),
  })
}

export async function fetchChoochoo(username: string, password: string): Promise<Game[]> {
  // Step 1: get XSRF token + session cookie
  const xsrfRes = await fetch(`${API}/api/xsrf`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
  })
  const xsrfJson = await xsrfRes.json() as any
  const xsrfToken: string = xsrfJson.xsrfToken ?? ''
  const sessionCookie = xsrfRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  if (!xsrfToken || !sessionCookie) throw new Error('choochoo.games: failed to get XSRF token')

  // Step 2: login
  const loginRes = await apiPost('/users/login', sessionCookie, xsrfToken, { usernameOrEmail: username, password })
  const loginJson = await loginRes.json() as any
  if (!loginJson.user) throw new Error('choochoo.games login failed')

  const myUserId: number = loginJson.user.id
  const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? sessionCookie

  // Step 3: fetch active games for this user
  const gamesRes = await apiGet(`/games?userId=${myUserId}&status[]=ACTIVE&pageSize=20`, authCookie)
  if (!gamesRes.ok) throw new Error(`choochoo.games games fetch failed: HTTP ${gamesRes.status}`)
  const gamesJson = await gamesRes.json() as any
  const games: any[] = gamesJson.games ?? []

  return games.map((g: any): Game => {
    const gameId = g.id ?? 0
    const isMyTurn = g.activePlayerId === myUserId

    // Build a list of other player IDs — fetch their usernames if playerIds is available
    const otherPlayerIds: number[] = (g.playerIds ?? []).filter((id: number) => id !== myUserId)

    const lastMoveAt = g.updatedAt ? new Date(g.updatedAt) : new Date()

    return {
      id: `choochoo:${gameId}`,
      platform: 'choochoo',
      gameName: g.name ?? g.gameKey ?? 'Unknown',
      myTurn: isMyTurn,
      currentPlayer: undefined,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl: `${BASE}/game/${gameId}`,
      platformUrl: `${BASE}/games`,
      players: otherPlayerIds.map(String), // IDs as strings until we can resolve names
    }
  })
}
