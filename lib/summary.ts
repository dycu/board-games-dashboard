import { FinishedGame, Platform } from './types'
import { summarizeResults, ResultSummary } from './results'

export interface GameBreakdown {
  platform: Platform
  gameName: string
  played: number
  won: number
  lost: number
  eloChange?: number  // sum of this period's changes (BGA ranked games)
  eloNow?: number     // rating after the period's last game of it
  gameKey?: string    // BGA game_id, for the per-game page
}

export interface PeriodSummary {
  from: Date
  to: Date
  games: FinishedGame[]          // finished in the period, newest first
  results: ResultSummary
  winRate: number | null         // share of competitive (won/lost) games won
  byGame: GameBreakdown[]        // most played first
  eloChange: number | null       // total over all games that report one
  // Platforms whose fetched history starts after the period does: their
  // older games in the period are missing
  partial: { platform: Platform; since: Date }[]
}

// A platform with fewer games than this probably returned its whole history,
// so a period reaching further back isn't missing anything
const LIKELY_CAPPED = 20

export function summarizePeriod(all: FinishedGame[], from: Date, to: Date): PeriodSummary {
  const inPeriod = (g: FinishedGame) => {
    const t = g.completedAt.getTime()
    return t > 0 && t >= from.getTime() && t <= to.getTime()
  }
  const games = all.filter(inPeriod).sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
  const results = summarizeResults(games)
  const competitive = results.won + results.lost

  const byKey = new Map<string, GameBreakdown & { lastAt: number }>()
  for (const g of games) {
    const name = g.gameType || g.gameName
    const key = `${g.platform}:${name.toLowerCase()}`
    let e = byKey.get(key)
    if (!e) { e = { platform: g.platform, gameName: name, played: 0, won: 0, lost: 0, lastAt: 0 }; byKey.set(key, e) }
    e.played++
    if (g.result === 'won') e.won++
    if (g.result === 'lost') e.lost++
    if (g.eloDelta !== undefined) e.eloChange = (e.eloChange ?? 0) + g.eloDelta
    if (g.elo !== undefined && g.completedAt.getTime() > e.lastAt) { e.eloNow = g.elo; e.lastAt = g.completedAt.getTime() }
    if (g.gameKey && !e.gameKey) e.gameKey = g.gameKey
  }
  const byGame = [...byKey.values()]
    .map(({ lastAt: _lastAt, ...rest }) => rest)
    .sort((a, b) => b.played - a.played || a.gameName.localeCompare(b.gameName))

  const withElo = games.filter(g => g.eloDelta !== undefined)
  const eloChange = withElo.length ? withElo.reduce((s, g) => s + g.eloDelta!, 0) : null

  const partial: PeriodSummary['partial'] = []
  const platforms = [...new Set(all.map(g => g.platform))]
  for (const p of platforms) {
    const times = all.filter(g => g.platform === p && g.completedAt.getTime() > 0).map(g => g.completedAt.getTime())
    if (times.length < LIKELY_CAPPED) continue
    const oldest = Math.min(...times)
    if (oldest > from.getTime()) partial.push({ platform: p, since: new Date(oldest) })
  }

  return {
    from, to, games, results,
    winRate: competitive ? results.won / competitive : null,
    byGame, eloChange, partial,
  }
}

export type PeriodPreset = '7d' | '30d' | 'month' | 'custom'

export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, now: Date): { from: Date; to: Date } {
  if (preset === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
  const days = preset === '7d' ? 7 : 30
  return { from: new Date(now.getTime() - days * 86_400_000), to: now }
}
