import { Game } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://18xx.games'

export async function fetchEighteenXX(username: string, password: string): Promise<Game[]> {
  const loginRes = await fetch(`${BASE}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: username, password }),
  })
  if (!loginRes.ok) throw new Error('18xx.games login failed')

  const loginData = await loginRes.json()
  const myId: number = loginData.user?.id
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''

  const gamesRes = await fetch(`${BASE}/api/game/user`, {
    headers: { Cookie: cookie },
  })
  if (!gamesRes.ok) throw new Error('18xx.games games fetch failed')

  const data = await gamesRes.json()
  const games: any[] = Array.isArray(data) ? data : data.games ?? []

  return games
    .filter((g: any) => g.status === 'active')
    .map((g: any): Game => {
      const lastMoveAt = new Date(g.updated_at ?? g.created_at)
      const activePlayers: any[] = g.active_players ?? []
      const isMyTurn = activePlayers.some((p: any) => p.id === myId)
      const currentPlayer = isMyTurn
        ? undefined
        : activePlayers[0]?.name

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
