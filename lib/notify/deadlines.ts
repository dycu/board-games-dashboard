import { PLATFORM_LABELS } from '../types'
import { formatTimeRemaining } from '../connectors/utils'
import { StreamedGame } from './types'

export const WARN_WITHIN_MS = 12 * 3600 * 1000

// game id → the deadline already warned about, so each deadline is warned once
export type Warned = Record<string, string>

export function dueSoon(games: StreamedGame[], warned: Warned, now: number): { toWarn: StreamedGame[]; warned: Warned } {
  const next: Warned = {}
  const toWarn: StreamedGame[] = []
  for (const g of games) {
    if (!g.myTurn || !g.deadlineAt) continue
    const left = new Date(g.deadlineAt).getTime() - now
    if (left > WARN_WITHIN_MS) continue
    // BGA recomputes the deadline from the time bank on each fetch, so it
    // drifts by seconds; a new turn moves it by hours
    const prev = warned[g.id]
    const sameDeadline = prev && Math.abs(new Date(prev).getTime() - new Date(g.deadlineAt).getTime()) < 3600 * 1000
    if (!sameDeadline) toWarn.push(g)
    next[g.id] = sameDeadline ? prev : g.deadlineAt
  }
  return { toWarn, warned: next }
}

export function deadlineEmail(games: StreamedGame[], now: number): { subject: string; text: string } {
  const line = (g: StreamedGame) =>
    `• ${g.gameName} (${PLATFORM_LABELS[g.platform]}) — ${formatTimeRemaining(Math.round((new Date(g.deadlineAt!).getTime() - now) / 1000))}\n  ${g.gameUrl}`
  return {
    subject: games.length === 1
      ? `⏱ ${games[0].gameName}: your move is due soon`
      : `⏱ ${games.length} board game moves due soon`,
    text: `Time is running out on these moves:\n\n${games.map(line).join('\n')}`,
  }
}
