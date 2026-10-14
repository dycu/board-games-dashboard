import { PaceTable, getTables } from './store'
import { FinishedGame, Game } from '../types'

export interface GameProgress {
  percent: number           // 0-100, clamped
  turnsSoFar: number
  estimatedTotalTurns: number // median finished-game turn count for this game type
  sampleCount: number
  samples: number[]         // the finished games' turn counts the estimate is built from
  sameSizeOnly: boolean     // whether those samples were restricted to games with the same player count
}

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// tableId: the BGA table id (Game.id / FinishedGame.id with the "bga:" prefix stripped)
export function estimateProgress(tables: Record<string, PaceTable>, tableId: string): GameProgress | null {
  const active = tables[tableId]
  const turnsSoFar = active?.totalTurnState?.count ?? 0
  if (turnsSoFar <= 0) return null

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
  if (samples.length === 0) return null

  const estimatedTotalTurns = median(samples)
  const percent = Math.max(0, Math.min(100, Math.round((turnsSoFar / estimatedTotalTurns) * 100)))
  return {
    percent, turnsSoFar, estimatedTotalTurns: Math.round(estimatedTotalTurns),
    sampleCount: samples.length, samples, sameSizeOnly: pool === sameSize,
  }
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
