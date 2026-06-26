import { Game } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://boardgamearena.com'

export async function fetchBGA(session: string, playerId: string, requestToken: string): Promise<Game[]> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/json, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Request-Token': requestToken,
    'Cookie': `PHPSESSID=${session}; TournoiEnLigneid=${requestToken}`,
  }

  const tablesRes = await fetch(`${BASE}/player/player/getactivetables.html?status=open`, { headers })
  const raw = await tablesRes.text()
  let tablesData: any
  try {
    tablesData = JSON.parse(raw)
  } catch {
    throw new Error(`BGA tables HTTP ${tablesRes.status}: ${raw.slice(0, 300) || '(empty body)'}`)
  }

  const tables: any[] = tablesData?.data?.tables ?? []

  return tables.map((t: any): Game => {
    const lastMoveAt = new Date(t.gameserver_updated * 1000)
    const isMyTurn = String(t.active_player) === playerId
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
