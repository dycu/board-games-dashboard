import { FinishedGame, PLATFORM_LABELS } from '../types'
import { Achievement } from './store'

// "Win 5 Wingspan" / "Play 10 Terraforming Mars on BGA"
export function achievementLabel(a: Pick<Achievement, 'metric' | 'target' | 'gameType' | 'platform'>): string {
  const verb = a.metric === 'won' ? 'Win' : 'Play'
  const scope = a.platform ? ` on ${PLATFORM_LABELS[a.platform]}` : ''
  return `${verb} ${a.target} ${a.gameType}${scope}`
}

// How many of the given finished games count toward one achievement —
// matched by (gameType || gameName) case-insensitively, optionally
// narrowed to one platform, counting either every game of it or just the
// ones this achievement's "won" metric cares about. A coop result is
// neither won nor lost (see lib/results.ts) — "won" only counts a clear
// personal win, not a shared coop clear, to keep the metric unambiguous.
export function progressOf(achievement: Achievement, games: FinishedGame[]): number {
  const name = achievement.gameType.toLowerCase()
  const matching = games.filter(g =>
    (g.gameType || g.gameName).toLowerCase() === name
    && (achievement.platform === null || g.platform === achievement.platform),
  )
  return achievement.metric === 'won' ? matching.filter(g => g.result === 'won').length : matching.length
}

// Pure: which not-yet-achieved goals now meet their target, given the
// current finished-games list. The caller persists achievedAt for these
// and decides how to celebrate — this just decides which ones qualify.
export function findNewlyUnlocked(achievements: Achievement[], games: FinishedGame[]): Achievement[] {
  return achievements.filter(a => !a.achievedAt && progressOf(a, games) >= a.target)
}
