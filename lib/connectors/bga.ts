import { Game } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://boardgamearena.com'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'X-Requested-With': 'XMLHttpRequest',
}

export async function fetchBGA(session: string): Promise<Game[]> {
  const cookie = `TournamentUserSession=${session}`

  // Get current player ID from profile endpoint
  const meRes = await fetch(`${BASE}/player/player/getinfos.html`, {
    headers: { ...HEADERS, Cookie: cookie },
  })
  const meData = await meRes.json()
  const myId = String(meData.data?.id ?? '')
  if (!myId) throw new Error('BGA: could not determine player ID — session cookie may be expired')

  // Get all active tables
  const tablesRes = await fetch(`${BASE}/player/player/getactivetables.html?status=open`, {
    headers: { ...HEADERS, Cookie: cookie },
  })
  const tablesData = await tablesRes.json()
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
