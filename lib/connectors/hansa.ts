import { Game, FinishedGame } from '../types'
import { formatTimeAgo } from './utils'
import { resultFromRanks } from '../results'

const API_BASE = 'https://hansa-teutonica-digital.onrender.com'
const UI_BASE = 'https://playhansa.app'

interface HtPlayer {
  name: string
  userId: string
  color?: string
  victoryPoints?: number
}

interface HtGame {
  id: string
  status: 'waiting_for_player' | 'playing' | 'finished'
  players: HtPlayer[]
  currentPlayerId: string
  displacedPlayerId?: string | null
  turnStartedAt: string | null
  updatedAt: string
  turnTimeoutSeconds: number | null
}

interface HtResponse {
  games: HtGame[]
  nextCursor: string | null
}

async function fetchGames(status: string): Promise<HtGame[]> {
  const all: HtGame[] = []
  let cursor: string | null = null
  do {
    const url = new URL(`${API_BASE}/games`)
    url.searchParams.set('limit', '100')
    url.searchParams.set('mode', 'all')
    url.searchParams.set('status', status)
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Hansa Teutonica API HTTP ${res.status}`)
    const data: HtResponse = await res.json()
    all.push(...data.games)
    cursor = data.nextCursor
  } while (cursor)
  return all
}

export async function fetchHansa(userId: string): Promise<Game[]> {
  if (!userId) throw new Error('HANSA_USER_ID is required')
  const myId = userId.replace(/-/g, '')
  const games = await fetchGames('playing')

  return games
    .filter(g => g.players.some(p => p.userId.replace(/-/g, '') === myId))
    .map((g): Game => {
      const myPlayer = g.players.find(p => p.userId.replace(/-/g, '') === myId)!
      // While a displacement is pending, the displaced player must act (relocate
      // their pieces) even though currentPlayerId is still the player who moved.
      const currentPlayerId = (g.displacedPlayerId || g.currentPlayerId)?.replace(/-/g, '') ?? ''
      const isMyTurn = !!currentPlayerId && currentPlayerId === myId
      const currentPlayer = isMyTurn
        ? undefined
        : g.players.find(p => p.userId.replace(/-/g, '') === currentPlayerId)?.name

      const lastMoveAt = g.turnStartedAt ? new Date(g.turnStartedAt) : new Date(g.updatedAt)

      return {
        id: `hansa:${g.id}`,
        platform: 'hansa',
        gameName: 'Hansa Teutonica',
        myTurn: isMyTurn,
        currentPlayer,
        lastMoveAt,
        lastMoveAgo: formatTimeAgo(lastMoveAt),
        urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
        gameUrl: `${UI_BASE}/game/${g.id}`,
        platformUrl: `${UI_BASE}/games?limit=20&mode=my_games`,
        players: g.players.filter(p => p.userId.replace(/-/g, '') !== myId).map(p => p.name),
      }
    })
}

export async function fetchFinishedHansa(userId: string): Promise<FinishedGame[]> {
  if (!userId) throw new Error('HANSA_USER_ID is required')
  const myId = userId.replace(/-/g, '')
  const games = await fetchGames('finished')

  return games
    .filter(g => g.players.some(p => p.userId.replace(/-/g, '') === myId))
    .map((g): FinishedGame => {
      const completedAt = new Date(g.updatedAt)
      // victoryPoints is the final total (end-game scoring included); equal
      // totals share a place
      const scored = g.players.every(p => typeof p.victoryPoints === 'number')
      const rankOf = (p: HtPlayer) => 1 + g.players.filter(o => o.victoryPoints! > p.victoryPoints!).length
      const me = g.players.find(p => p.userId.replace(/-/g, '') === myId)!
      const rank = rankOf(me)
      return {
        id: `hansa:${g.id}`,
        platform: 'hansa',
        gameName: 'Hansa Teutonica',
        completedAt,
        completedAgo: formatTimeAgo(completedAt),
        gameUrl: `${UI_BASE}/game/${g.id}`,
        ...(scored && {
          result: resultFromRanks(rank, g.players.map(rankOf)),
          rank,
          playerCount: g.players.length,
          score: String(me.victoryPoints),
          opponents: g.players.filter(p => p !== me).map(p => ({ name: p.name, rank: rankOf(p) })),
        }),
      }
    })
}
