import { Game, FinishedGame } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://hansa-teutonica-digital.onrender.com'

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
    const url = new URL(`${BASE}/games`)
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

export async function fetchHansa(username: string): Promise<Game[]> {
  if (!username) throw new Error('HANSA_USERNAME is required')
  const games = await fetchGames('playing')

  return games
    .filter(g => g.players.some(p => p.name === username))
    .map((g): Game => {
      const myPlayer = g.players.find(p => p.name === username)!
      const myIdStripped = myPlayer.userId.replace(/-/g, '')
      const isMyTurn = !!g.currentPlayerId && g.currentPlayerId === myIdStripped
      const currentPlayer = isMyTurn
        ? undefined
        : g.players.find(p => p.userId.replace(/-/g, '') === g.currentPlayerId)?.name

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
        gameUrl: `${BASE}/games/${g.id}`,
        platformUrl: `${BASE}/games?limit=20&mode=my_games`,
        players: g.players.filter(p => p.name !== username).map(p => p.name),
      }
    })
}

export async function fetchFinishedHansa(username: string): Promise<FinishedGame[]> {
  if (!username) throw new Error('HANSA_USERNAME is required')
  const games = await fetchGames('finished')

  return games
    .filter(g => g.players.some(p => p.name === username))
    .map((g): FinishedGame => {
      const completedAt = new Date(g.updatedAt)
      return {
        id: `hansa:${g.id}`,
        platform: 'hansa',
        gameName: 'Hansa Teutonica',
        completedAt,
        completedAgo: formatTimeAgo(completedAt),
        gameUrl: `${BASE}/games/${g.id}`,
      }
    })
}
