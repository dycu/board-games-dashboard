import { Game } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://18xx.games'

export async function fetchEighteenXX(username: string, password: string): Promise<Game[]> {
  // 18xx.games API uses 'email' field but accepts username too
  const loginRes = await fetch(`${BASE}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: username, password }),
  })
  if (!loginRes.ok) throw new Error('18xx.games login failed')

  const loginData = await loginRes.json()
  const myId: number = loginData.user?.id
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''

  const gamesRes = await fetch(`${BASE}/api/game/user`, {
    headers: { Cookie: cookie, Accept: 'application/json' },
  })
  if (!gamesRes.ok) throw new Error('18xx.games games fetch failed')

  const data = await gamesRes.json()
  const games: any[] = Array.isArray(data) ? data : data.games ?? []

  return games
    .filter((g: any) => g.status === 'active' && (g.players ?? []).some((p: any) => p.id === myId))
    .map((g: any): Game => {
      // updated_at may be a Unix timestamp (seconds) or an ISO string
      const rawTime = g.updated_at ?? g.created_at
      const lastMoveAt = typeof rawTime === 'number' ? new Date(rawTime * 1000) : new Date(rawTime)
      // API may return acting (array of IDs) or active_players (array of {id, name})
      const activePlayers: any[] = g.active_players ?? []
      const acting: number[] = g.acting ?? activePlayers.map((p: any) => p.id)
      const isMyTurn = acting.includes(myId)
      const currentPlayer = isMyTurn
        ? undefined
        : (g.players ?? []).find((p: any) => acting.includes(p.id) && p.id !== myId)?.name
          ?? activePlayers.find((p: any) => p.id !== myId)?.name

      return {
        id: `eighteenxx:${g.id}`,
        platform: 'eighteenxx',
        gameName: g.title ?? 'Unknown',
        myTurn: isMyTurn,
        currentPlayer,
        lastMoveAt,
        lastMoveAgo: formatTimeAgo(lastMoveAt),
        urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
        gameUrl: `${BASE}/game/${g.id}`,
        platformUrl: BASE,
        players: (g.players ?? [])
          .map((p: any) => p.name)
          .filter((n: string) => n !== username),
      }
    })
}
