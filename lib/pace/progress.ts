import { PaceTable, getTables } from './store'
import { FinishedGame, Game } from '../types'

export interface GameProgress {
  percent: number           // 0-100, clamped
  turnsSoFar: number        // real elapsed seconds instead, when timeBased
  estimatedTotalTurns: number // median finished-game turn count for this game type; median real-time duration (seconds), when timeBased
  sampleCount: number
  samples: number[]         // the finished games' turn counts the estimate is built from; durations, when timeBased
  sameSizeOnly: boolean     // whether those samples were restricted to games with the same player count
  timeBased?: boolean       // no turn-count samples (BGA's own archive only keeps a table's move log for ~6h after it ends) — real elapsed time vs. typical real-time length, instead
}

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Fallback for when there's no turn-count sample to compare against — BGA's
// own archive only keeps a table's move log for a few hours after it ends,
// so a game type with no recently-tracked finish never gets one otherwise.
// `start`/`end` cost nothing extra: they're read off the finished-games list
// itself, not the (often-gone) move log, so they're there for every indexed
// table regardless of whether its turns were ever readable.
function estimateTimeProgress(tables: Record<string, PaceTable>, tableId: string): GameProgress | null {
  const active = tables[tableId]
  if (!active || active.end !== null) return null
  const elapsedSeconds = Date.now() / 1000 - active.start
  if (elapsedSeconds <= 0) return null

  // Realtime games (played live in one sitting) finish in a wildly different
  // timeframe than async ones of the same type — mixing them in would skew
  // the median, so they're excluded here exactly as they are from the
  // existing response-time pace stats (lib/pace/stats.ts).
  const finishedOfType = Object.values(tables)
    .filter(t => t.id !== tableId && t.end !== null && t.game === active.game && !t.realtime)

  const sameSize = active.playerCount !== undefined
    ? finishedOfType.filter(t => t.playerCount === active.playerCount)
    : []
  const pool = sameSize.length > 0 ? sameSize : finishedOfType
  const durations = pool.map(t => t.end! - t.start).filter(d => d > 0).sort((a, b) => a - b)
  if (durations.length === 0) return null

  const estimatedTotalSeconds = median(durations)
  const percent = Math.max(0, Math.min(100, Math.round((elapsedSeconds / estimatedTotalSeconds) * 100)))
  return {
    percent, turnsSoFar: Math.round(elapsedSeconds), estimatedTotalTurns: Math.round(estimatedTotalSeconds),
    sampleCount: durations.length, samples: durations, sameSizeOnly: pool === sameSize, timeBased: true,
  }
}

// tableId: the BGA table id (Game.id / FinishedGame.id with the "bga:" prefix stripped)
export function estimateProgress(tables: Record<string, PaceTable>, tableId: string): GameProgress | null {
  const active = tables[tableId]
  const turnsSoFar = active?.totalTurnState?.count ?? 0
  if (turnsSoFar > 0) {
    const finishedOfType = Object.values(tables)
      .filter(t => t.id !== tableId && t.end !== null && t.game === active.game && (t.totalTurnState?.count ?? 0) > 0)

    // Player count can shift how many turns a game naturally takes (more
    // players, more turns around the table) — prefer matching it, but a game
    // type with too few finished plays at that exact size still gets an
    // estimate from the wider pool rather than none at all.
    const sameSize = active.playerCount !== undefined
      ? finishedOfType.filter(t => t.playerCount === active.playerCount)
      : []
    const pool = sameSize.length > 0 ? sameSize : finishedOfType
    const samples = pool.map(t => t.totalTurnState!.count).sort((a, b) => a - b)
    if (samples.length > 0) {
      const estimatedTotalTurns = median(samples)
      const percent = Math.max(0, Math.min(100, Math.round((turnsSoFar / estimatedTotalTurns) * 100)))
      return {
        percent, turnsSoFar, estimatedTotalTurns: Math.round(estimatedTotalTurns),
        sampleCount: samples.length, samples, sameSizeOnly: pool === sameSize,
      }
    }
  }
  return estimateTimeProgress(tables, tableId)
}

// Attaches `progress` to every BGA game in a live list (Active tab)
export async function attachProgress(games: Game[]): Promise<Game[]> {
  if (!games.some(g => g.platform === 'bga')) return games
  const tables = await getTables().catch((): Record<string, PaceTable> => ({}))
  return games.map(g => {
    if (g.platform !== 'bga') return g
    const progress = estimateProgress(tables, g.id.slice('bga:'.length))
    return progress ? { ...g, progress } : g
  })
}

// Attaches `turns` (the whole game's final turn count, when tracked) to
// every BGA game in a finished list (History)
export async function attachTurns<T extends Pick<FinishedGame, 'id' | 'platform'>>(games: T[]): Promise<T[]> {
  if (!games.some(g => g.platform === 'bga')) return games
  const tables = await getTables().catch((): Record<string, PaceTable> => ({}))
  return games.map(g => {
    if (g.platform !== 'bga') return g
    const turns = tables[g.id.slice('bga:'.length)]?.totalTurnState?.count
    return turns && turns > 0 ? { ...g, turns } : g
  })
}
