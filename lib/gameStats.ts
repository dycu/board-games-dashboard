import { FinishedGame } from './types'
import { summarizeResults, ResultSummary } from './results'

export interface OpponentRecord {
  name: string
  games: number
  iWon: number   // I placed above them
  theyWon: number
}

export interface GameStats {
  plays: number
  first: Date | null
  last: Date | null
  results: ResultSummary
  winRate: number | null          // of competitive (won/lost) games
  avgRank: number | null
  eloNow: number | null
  eloBest: number | null
  eloSeries: { t: number; elo: number }[] // oldest first
  avgDurationDays: number | null
  usualPlayerCount: number | null
  opponents: OpponentRecord[]     // most played first
}

const known = (g: FinishedGame) => g.completedAt.getTime() > 0

// Everything the per-game page shows, from whichever finished games a site gives
export function gameStats(games: FinishedGame[]): GameStats {
  const dated = games.filter(known).sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
  const results = summarizeResults(games)
  const competitive = results.won + results.lost

  const ranked = games.filter(g => g.rank && g.result !== 'coop')
  const eloSeries = dated.filter(g => g.elo !== undefined).map(g => ({ t: g.completedAt.getTime(), elo: g.elo! }))

  const durations = games
    .filter(g => g.startedAt && known(g))
    .map(g => (g.completedAt.getTime() - new Date(g.startedAt!).getTime()) / 86_400_000)
    .filter(d => d >= 0)

  const counts = new Map<number, number>()
  for (const g of games) if (g.playerCount) counts.set(g.playerCount, (counts.get(g.playerCount) ?? 0) + 1)
  const usualPlayerCount = counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : null

  const opp = new Map<string, OpponentRecord>()
  for (const g of games) {
    for (const o of g.opponents ?? []) {
      const key = o.name.toLowerCase()
      let r = opp.get(key)
      if (!r) { r = { name: o.name, games: 0, iWon: 0, theyWon: 0 }; opp.set(key, r) }
      r.games++
      if (g.result === 'coop') continue
      if (g.rank && o.rank) {
        if (g.rank < o.rank) r.iWon++
        else if (o.rank < g.rank) r.theyWon++
      } else if (g.result === 'won') r.iWon++
      else if (g.result === 'lost' && o.rank === 1) r.theyWon++
    }
  }

  return {
    plays: games.length,
    first: dated[0]?.completedAt ?? null,
    last: dated[dated.length - 1]?.completedAt ?? null,
    results,
    winRate: competitive ? results.won / competitive : null,
    avgRank: ranked.length ? ranked.reduce((s, g) => s + g.rank!, 0) / ranked.length : null,
    eloNow: eloSeries.length ? eloSeries[eloSeries.length - 1].elo : null,
    eloBest: eloSeries.length ? Math.max(...eloSeries.map(p => p.elo)) : null,
    eloSeries,
    avgDurationDays: durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null,
    usualPlayerCount,
    opponents: [...opp.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)),
  }
}

// The games of one game in a finished-games list (table titles grouped by game type)
export function gamesOf(all: FinishedGame[], platform: string, name: string): FinishedGame[] {
  const n = name.toLowerCase()
  return all.filter(g => g.platform === platform && (g.gameType || g.gameName).toLowerCase() === n)
}

export function gameHistoryHref(g: Pick<FinishedGame, 'platform' | 'gameName' | 'gameType' | 'gameKey'>): string {
  const q = new URLSearchParams({ platform: g.platform, name: g.gameType || g.gameName })
  if (g.gameKey) q.set('key', g.gameKey)
  return `/history/game?${q}`
}
