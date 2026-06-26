import { Game } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://boardgamearena.com'

export async function fetchBGA(username: string, password: string): Promise<Game[]> {
  const loginRes = await fetch(`${BASE}/account/account/login.html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: username, password, rememberme: 'on', redirect: 'studio' }),
  })
  const loginData = await loginRes.json()
  if (loginData.status !== 1) throw new Error('BGA login failed')

  const cookie = loginRes.headers.get('set-cookie') ?? ''
  const sessionCookie = cookie.split(';')[0]

  const gamesRes = await fetch(`${BASE}/player/player/getactivetables.html?status=open`, {
    headers: { Cookie: sessionCookie },
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
