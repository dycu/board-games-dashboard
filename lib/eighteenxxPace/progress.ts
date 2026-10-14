import { Game, FinishedGame } from '../types'
import { getEighteenxxPaceGames, EighteenxxPaceGame } from './store'

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// id: the 18xx.games numeric game id (Game.id / FinishedGame.id with the
// "eighteenxx:" prefix stripped)
export function estimateEighteenxxProgress(games: Record<string, EighteenxxPaceGame>, id: string): Game['progress'] | undefined {
  const active = games[id]
  const count = active?.actionCount ?? 0
  if (!active || active.end !== null || count <= 0) return undefined

  const finishedOfType = Object.values(games)
    .filter(g => g.id !== id && g.end !== null && g.title === active.title && (g.actionCount ?? 0) > 0)

  const sameSize = active.playerCount !== undefined
    ? finishedOfType.filter(g => g.playerCount === active.playerCount)
    : []
  const pool = sameSize.length > 0 ? sameSize : finishedOfType
  const counts = pool.map(g => g.actionCount!).sort((a, b) => a - b)
  if (counts.length === 0) return undefined

  const estimatedTotal = median(counts)
  const percent = Math.max(0, Math.min(100, Math.round((count / estimatedTotal) * 100)))
  return {
    percent, turnsSoFar: count, estimatedTotalTurns: Math.round(estimatedTotal),
    sampleCount: counts.length, samples: counts, sameSizeOnly: pool === sameSize,
  }
}

export async function attachEighteenxxProgress(games: Game[]): Promise<Game[]> {
  if (!games.some(g => g.platform === 'eighteenxx')) return games
  const stored = await getEighteenxxPaceGames().catch((): Record<string, EighteenxxPaceGame> => ({}))
  return games.map(g => {
    if (g.platform !== 'eighteenxx') return g
    const id = g.id.slice('eighteenxx:'.length)
    const progress = estimateEighteenxxProgress(stored, id)
    if (progress) return { ...g, progress }
    const lastError = stored[id]?.lastError
    return lastError ? { ...g, progressError: lastError } : g
  })
}

export async function attachEighteenxxTurns<T extends Pick<FinishedGame, 'id' | 'platform'>>(games: T[]): Promise<T[]> {
  if (!games.some(g => g.platform === 'eighteenxx')) return games
  const stored = await getEighteenxxPaceGames().catch((): Record<string, EighteenxxPaceGame> => ({}))
  return games.map(g => {
    if (g.platform !== 'eighteenxx') return g
    const count = stored[g.id.slice('eighteenxx:'.length)]?.actionCount
    return count && count > 0 ? { ...g, turns: count } : g
  })
}
