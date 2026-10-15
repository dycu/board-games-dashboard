import { Game, FinishedGame } from '../types'
import { formatTimeAgo, withTimeout } from './utils'
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
  turn?: number     // how far this game has gone; stays at its final value once finished
  mapId?: string    // determines how long a game of this size typically runs
  createdAt?: string // ISO; ETA is projected off this game's own pace since it started
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

// Hansa has no fixed turn limit — a game ends when a resource (e.g. city
// keys) runs out — so there's no total to read off the active game itself.
// Unlike BGA/Rally/18xx this needs no tracker of our own though: `mode=all`
// on the finished-games endpoint already returns every finished game on the
// platform (not just mine), so the historical sample to estimate a median
// from is free and public, fetched fresh on each request.
interface FinishedSample { mapId: string; playerCount: number; turn: number }

const FINISHED_PAGE_LIMIT = 100
const FINISHED_MAX_PAGES = 5 // ~500 games — comfortably covers the platform's whole history today; a cap against unbounded growth over time
const FINISHED_FETCH_TIMEOUT_MS = 6000

async function fetchFinishedSamples(): Promise<FinishedSample[]> {
  const samples: FinishedSample[] = []
  let cursor: string | null = null
  for (let page = 0; page < FINISHED_MAX_PAGES; page++) {
    const url = new URL(`${API_BASE}/games`)
    url.searchParams.set('limit', String(FINISHED_PAGE_LIMIT))
    url.searchParams.set('mode', 'all')
    url.searchParams.set('status', 'finished')
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await withTimeout(fetch(url.toString()), FINISHED_FETCH_TIMEOUT_MS, 'Hansa finished-games fetch')
    if (!res.ok) throw new Error(`Hansa Teutonica API HTTP ${res.status}`)
    const data: HtResponse = await res.json()
    for (const g of data.games) {
      if ((g.turn ?? 0) > 0) samples.push({ mapId: g.mapId ?? '', playerCount: g.players.length, turn: g.turn! })
    }
    cursor = data.nextCursor
    if (!cursor) break
  }
  return samples
}

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function estimateHansaProgress(g: HtGame, samples: FinishedSample[]): Game['progress'] | undefined {
  const turnsSoFar = g.turn ?? 0
  if (turnsSoFar <= 0) return undefined
  const ofMap = samples.filter(s => s.mapId === (g.mapId ?? ''))
  const sameSize = ofMap.filter(s => s.playerCount === g.players.length)
  const pool = sameSize.length > 0 ? sameSize : ofMap
  if (pool.length === 0) return undefined
  const sorted = pool.map(s => s.turn).sort((a, b) => a - b)
  const estimatedTotalTurns = Math.round(median(sorted))
  const percent = Math.max(0, Math.min(100, Math.round((turnsSoFar / estimatedTotalTurns) * 100)))
  const progress: Game['progress'] = {
    percent, turnsSoFar, estimatedTotalTurns, sampleCount: sorted.length, samples: sorted, sameSizeOnly: pool === sameSize,
    sameSizeSampleCount: sameSize.length, totalSampleCount: ofMap.length,
  }

  // ETA is projected off this specific game's own pace since it started, not
  // the finished samples' pace — a game can run faster or slower than typical.
  const turnsRemaining = estimatedTotalTurns - turnsSoFar
  if (turnsRemaining <= 0) return { ...progress, etaSeconds: 0 }
  const createdAt = g.createdAt ? new Date(g.createdAt).getTime() / 1000 : undefined
  if (createdAt) {
    const elapsed = Date.now() / 1000 - createdAt
    if (elapsed > 0 && turnsSoFar > 0) {
      const turnsPerSecond = turnsSoFar / elapsed
      return { ...progress, etaSeconds: turnsRemaining / turnsPerSecond }
    }
  }
  return progress
}

export interface HansaActiveGameEta {
  id: string
  game: string // Hansa only hosts the one game, so this is always 'Hansa Teutonica'
  percent: number
  sampleCount: number
  etaSeconds?: number
}

// Every currently-running Hansa game of mine with an estimate, for the Pace
// page's "when are your active games likely to end" chart — see
// lib/pace/progress.ts's listActiveGameEtas, which this mirrors. Hansa keeps
// no tracker of its own (see estimateHansaProgress above), so this re-fetches
// live each time rather than reading from KV like the other platforms do.
export async function listActiveHansaGameEtas(userId: string): Promise<HansaActiveGameEta[]> {
  if (!userId) return []
  const myId = userId.replace(/-/g, '')
  const [games, finishedSamples] = await Promise.all([
    fetchGames('playing'),
    fetchFinishedSamples().catch((): FinishedSample[] => []),
  ])
  return games
    .filter(g => g.players.some(p => p.userId.replace(/-/g, '') === myId))
    .map(g => ({ table: g, progress: estimateHansaProgress(g, finishedSamples) }))
    .filter((x): x is { table: HtGame; progress: NonNullable<Game['progress']> } => !!x.progress)
    .map(({ table, progress }) => ({
      id: table.id, game: 'Hansa Teutonica', percent: progress.percent, sampleCount: progress.sampleCount,
      etaSeconds: progress.etaSeconds,
    }))
    .sort((a, b) => (a.etaSeconds ?? Infinity) - (b.etaSeconds ?? Infinity))
}

export async function fetchHansa(userId: string): Promise<Game[]> {
  if (!userId) throw new Error('HANSA_USER_ID is required')
  const myId = userId.replace(/-/g, '')
  const [games, finishedSamples] = await Promise.all([
    fetchGames('playing'),
    fetchFinishedSamples().catch((): FinishedSample[] => []),
  ])

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
      const progress = estimateHansaProgress(g, finishedSamples)

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
        ...(progress && { progress }),
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
        ...(g.turn && g.turn > 0 && { turns: g.turn }),
      }
    })
}
