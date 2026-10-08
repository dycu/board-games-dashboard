import { FinishedGame } from './types'

export type GameResult = 'won' | 'lost' | 'draw' | 'coop'

// From my place and everyone's places (1 = first). Sharing first place with
// everyone is a draw; sharing it with only some still counts as a win.
export function resultFromRanks(myRank: number, ranks: number[]): GameResult {
  if (myRank !== 1) return 'lost'
  return ranks.every(r => r === 1) ? 'draw' : 'won'
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${s}`
}

// "1st of 4", "co-op", "draw"
export function placeLabel(g: Pick<FinishedGame, 'result' | 'rank' | 'playerCount'>): string | null {
  if (g.result === 'coop') return 'co-op'
  if (g.result === 'draw') return 'draw'
  if (g.rank && g.playerCount) return `${ordinal(g.rank)} of ${g.playerCount}`
  return g.result ?? null
}

// BGA only reports the rating after each game; the change is the difference
// from the previous game of the same kind in the fetched history
export function withEloDeltas<T extends Pick<FinishedGame, 'gameName' | 'completedAt' | 'elo' | 'eloDelta'>>(games: T[]): T[] {
  const byTime = [...games].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
  const last = new Map<string, number>()
  const deltas = new Map<T, number>()
  for (const g of byTime) {
    if (g.elo === undefined) continue
    const prev = last.get(g.gameName)
    if (prev !== undefined) deltas.set(g, g.elo - prev)
    last.set(g.gameName, g.elo)
  }
  return games.map(g => (deltas.has(g) ? { ...g, eloDelta: deltas.get(g) } : g))
}

export interface ResultSummary { played: number; won: number; lost: number; draws: number; coop: number }

export function summarizeResults(games: Pick<FinishedGame, 'result'>[]): ResultSummary {
  const s: ResultSummary = { played: 0, won: 0, lost: 0, draws: 0, coop: 0 }
  for (const g of games) {
    if (!g.result) continue
    s.played++
    if (g.result === 'won') s.won++
    else if (g.result === 'lost') s.lost++
    else if (g.result === 'draw') s.draws++
    else s.coop++
  }
  return s
}
