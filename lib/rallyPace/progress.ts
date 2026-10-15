import { getRallyGames, RallyPaceGame } from './store'
import { Game, FinishedGame } from '../types'

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface RallyProgress {
  percent: number
  turnsSoFar: number
  estimatedTotalTurns: number
  sampleCount: number
  samples: number[]
  sameSizeOnly: boolean
  sameSizeSampleCount: number
  totalSampleCount: number
}

// id: the Rally table id (Game.id / FinishedGame.id with the "rally:" prefix stripped)
export function estimateRallyProgress(games: Record<string, RallyPaceGame>, id: string): RallyProgress | null {
  const active = games[id]
  const turnsSoFar = active?.turn ?? 0
  if (!active || active.end !== null || turnsSoFar <= 0) return null

  const finishedOfType = Object.values(games)
    .filter(g => g.id !== id && g.end !== null && g.game === active.game && (g.turn ?? 0) > 0)

  const sameSize = active.playerCount !== undefined
    ? finishedOfType.filter(g => g.playerCount === active.playerCount)
    : []
  const pool = sameSize.length > 0 ? sameSize : finishedOfType
  const samples = pool.map(g => g.turn!).sort((a, b) => a - b)
  if (samples.length === 0) return null

  const estimatedTotalTurns = median(samples)
  const percent = Math.max(0, Math.min(100, Math.round((turnsSoFar / estimatedTotalTurns) * 100)))
  return {
    percent, turnsSoFar, estimatedTotalTurns: Math.round(estimatedTotalTurns),
    sampleCount: samples.length, samples, sameSizeOnly: pool === sameSize,
    sameSizeSampleCount: sameSize.length, totalSampleCount: finishedOfType.length,
  }
}

export async function attachRallyProgress(games: Game[]): Promise<Game[]> {
  if (!games.some(g => g.platform === 'rally')) return games
  const stored = await getRallyGames().catch((): Record<string, RallyPaceGame> => ({}))
  return games.map(g => {
    if (g.platform !== 'rally') return g
    const id = g.id.slice('rally:'.length)
    const progress = estimateRallyProgress(stored, id)
    if (progress) return { ...g, progress }
    // No estimate — tell "no data yet" (nothing to show) apart from "the
    // last attempt to read this game's state actually failed" (worth flagging)
    const lastError = stored[id]?.lastError
    return lastError ? { ...g, progressError: lastError } : g
  })
}

export async function attachRallyTurns<T extends Pick<FinishedGame, 'id' | 'platform'>>(games: T[]): Promise<T[]> {
  if (!games.some(g => g.platform === 'rally')) return games
  const stored = await getRallyGames().catch((): Record<string, RallyPaceGame> => ({}))
  return games.map(g => {
    if (g.platform !== 'rally') return g
    const turns = stored[g.id.slice('rally:'.length)]?.turn
    return turns && turns > 0 ? { ...g, turns } : g
  })
}
