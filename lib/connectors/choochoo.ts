import { Game } from '../types'
import { formatTimeAgo } from './utils'

const API = 'https://api.choochoo.games'
const BASE = 'https://www.choochoo.games'

export async function fetchChoochoo(username: string, password: string): Promise<Game[]> {
  // Step 1: get XSRF token from body (endpoint sets no cookie)
  const xsrfRes = await fetch(`${API}/api/xsrf`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
  })
  const xsrfJson = await xsrfRes.json() as any
  const xsrfToken: string = xsrfJson.xsrfToken ?? ''
  if (!xsrfToken) throw new Error('choochoo.games: failed to get XSRF token')

  // Step 2: login — XSRF token goes in header, no session cookie needed at this stage
  const loginRes = await fetch(`${API}/users/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'xsrf-token': xsrfToken,
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ usernameOrEmail: username, password }),
  })
  const loginJson = await loginRes.json() as any
  if (!loginJson.user) throw new Error('choochoo.games login failed')

  const myUserId: number = loginJson.user.id
  const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''

  // Step 3: fetch active games using the session cookie from login
  const gamesRes = await fetch(`${API}/games?userId=${myUserId}&status[]=ACTIVE&pageSize=20`, {
    headers: { Accept: 'application/json', Cookie: authCookie, 'User-Agent': 'Mozilla/5.0' },
  })
  if (!gamesRes.ok) throw new Error(`choochoo.games games fetch failed: HTTP ${gamesRes.status}`)
  const gamesJson = await gamesRes.json() as any
  const games: any[] = gamesJson.games ?? []

  return games.map((g: any): Game => {
    const gameId = g.id ?? 0
    const isMyTurn = g.activePlayerId === myUserId
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
      players: otherPlayerIds.map(String),
    }
  })
}
