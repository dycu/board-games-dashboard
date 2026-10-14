import { Game } from '../types'
import { EighteenxxSamples } from './store'

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function estimateEighteenxxProgress(
  samples: EighteenxxSamples,
  title: string,
  turn: unknown,
  playerCount: number,
): Game['progress'] | undefined {
  if (typeof turn !== 'number' || turn <= 0) return undefined
  const finished = samples[title] ?? []
  if (finished.length === 0) return undefined

  const sameSize = finished.filter(s => s.playerCount === playerCount)
  const pool = sameSize.length > 0 ? sameSize : finished
  const turns = pool.map(s => s.turn).sort((a, b) => a - b)

  const estimatedTotalTurns = median(turns)
  const percent = Math.max(0, Math.min(100, Math.round((turn / estimatedTotalTurns) * 100)))
  return {
    percent, turnsSoFar: turn, estimatedTotalTurns: Math.round(estimatedTotalTurns),
    sampleCount: turns.length, samples: turns, sameSizeOnly: pool === sameSize,
  }
}
