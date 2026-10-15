import { Game, FinishedGame } from '../types'
import { getEighteenxxPaceGames, EighteenxxPaceGame } from './store'

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// See lib/pace/progress.ts's withEta for the reasoning. `start` is only
// known for a game synced since that field was added, so a turn-count
// estimate on an older-tracked active game just won't get one.
function withEta(active: EighteenxxPaceGame, progress: NonNullable<Game['progress']>): NonNullable<Game['progress']> {
  if (progress.timeBased) {
    return { ...progress, etaSeconds: Math.max(0, progress.estimatedTotalTurns - progress.turnsSoFar) }
  }
  if (!active.start) return progress
  const elapsed = Date.now() / 1000 - active.start
  const turnsRemaining = progress.estimatedTotalTurns - progress.turnsSoFar
  if (turnsRemaining <= 0) return { ...progress, etaSeconds: 0 }
  if (elapsed <= 0 || progress.turnsSoFar <= 0) return progress
  const turnsPerSecond = progress.turnsSoFar / elapsed
  return { ...progress, etaSeconds: turnsRemaining / turnsPerSecond }
}

// Fallback for a game type with no readable action-count sample — old enough
// games fall off this site's own ability to return a full action log (see the
// "18Chesapeake" case this was built for), but `start`/`end` cost nothing
// extra: they're read off the games list itself, not the per-game detail, so
// they're there even for a game whose action log came back empty.
function estimateEighteenxxTimeProgress(games: Record<string, EighteenxxPaceGame>, id: string): Game['progress'] | undefined {
  const active = games[id]
  if (!active || active.end !== null || !active.start) return undefined
  const elapsedSeconds = Date.now() / 1000 - active.start
  if (elapsedSeconds <= 0) return undefined

  const finishedOfType = Object.values(games)
    .filter(g => g.id !== id && g.end !== null && g.title === active.title && g.start)

  const sameSize = active.playerCount !== undefined
    ? finishedOfType.filter(g => g.playerCount === active.playerCount)
    : []
  const pool = sameSize.length > 0 ? sameSize : finishedOfType
  const durations = pool.map(g => g.end! - g.start!).filter(d => d > 0).sort((a, b) => a - b)
  if (durations.length === 0) return undefined

  const estimatedTotalSeconds = median(durations)
  const percent = Math.max(0, Math.min(100, Math.round((elapsedSeconds / estimatedTotalSeconds) * 100)))
  // Falling back to time only means there's no action-count *sample* to
  // estimate a total from — this game's own running action count can still
  // be read and worth showing alongside the time-based estimate.
  const actualTurnsSoFar = active.actionCount ?? 0
  return withEta(active, {
    percent, turnsSoFar: Math.round(elapsedSeconds), estimatedTotalTurns: Math.round(estimatedTotalSeconds),
    sampleCount: durations.length, samples: durations, sameSizeOnly: pool === sameSize, timeBased: true,
    sameSizeSampleCount: sameSize.length, totalSampleCount: finishedOfType.length,
    ...(actualTurnsSoFar > 0 && { actualTurnsSoFar }),
  })
}

// id: the 18xx.games numeric game id (Game.id / FinishedGame.id with the
// "eighteenxx:" prefix stripped)
export function estimateEighteenxxProgress(games: Record<string, EighteenxxPaceGame>, id: string): Game['progress'] | undefined {
  const active = games[id]
  const count = active?.actionCount ?? 0
  if (active && active.end === null && count > 0) {
    const finishedOfType = Object.values(games)
      .filter(g => g.id !== id && g.end !== null && g.title === active.title && (g.actionCount ?? 0) > 0)

    const sameSize = active.playerCount !== undefined
      ? finishedOfType.filter(g => g.playerCount === active.playerCount)
      : []
    const pool = sameSize.length > 0 ? sameSize : finishedOfType
    const counts = pool.map(g => g.actionCount!).sort((a, b) => a - b)
    if (counts.length > 0) {
      const estimatedTotal = median(counts)
      const percent = Math.max(0, Math.min(100, Math.round((count / estimatedTotal) * 100)))
      return withEta(active, {
        percent, turnsSoFar: count, estimatedTotalTurns: Math.round(estimatedTotal),
        sampleCount: counts.length, samples: counts, sameSizeOnly: pool === sameSize,
        sameSizeSampleCount: sameSize.length, totalSampleCount: finishedOfType.length,
      })
    }
  }
  return estimateEighteenxxTimeProgress(games, id)
}

export interface EighteenxxActiveGameEta {
  id: string
  game: string // already a display title (e.g. "1846") — no slug to resolve
  percent: number
  sampleCount: number
  timeBased?: boolean
  etaSeconds?: number
}

// Every currently-running 18xx game with an estimate, for the Pace page's
// "when are your active games likely to end" chart — see lib/pace/progress.ts's
// listActiveGameEtas, which this mirrors for this platform's own tracker.
export function listActiveEighteenxxGameEtas(games: Record<string, EighteenxxPaceGame>): EighteenxxActiveGameEta[] {
  return Object.values(games)
    .filter(g => g.end === null)
    .map(g => ({ table: g, progress: estimateEighteenxxProgress(games, g.id) }))
    .filter((x): x is { table: EighteenxxPaceGame; progress: NonNullable<Game['progress']> } => !!x.progress)
    .map(({ table, progress }) => ({
      id: table.id, game: table.title, percent: progress.percent, sampleCount: progress.sampleCount,
      timeBased: progress.timeBased, etaSeconds: progress.etaSeconds,
    }))
    .sort((a, b) => (a.etaSeconds ?? Infinity) - (b.etaSeconds ?? Infinity))
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
