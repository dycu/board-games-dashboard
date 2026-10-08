import { FinishedGame, PLATFORM_LABELS } from '../types'
import { summarizePeriod } from '../summary'
import { placeLabel } from '../results'
import { formatTimeAgo } from '../connectors/utils'
import { StreamedGame } from './types'

export interface WeeklyPace { turns: number; medianHours: number | null; turnsPerDay: number | null }

const MAX_STALLED = 3

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

// Sunday's email: the week's finished games and results, ELO changes, my BGA
// pace and the games stalled longest on opponents. The numbers are the same
// as History's 7-day summary.
export function buildWeekly(
  finished: FinishedGame[],
  active: StreamedGame[],
  options: { now: number; pace?: WeeklyPace | null },
): { subject: string; text: string; html: string } {
  const to = new Date(options.now)
  const from = new Date(options.now - 7 * 86_400_000)
  const s = summarizePeriod(finished, from, to)
  const { results } = s

  const headline = s.games.length === 0
    ? 'no games finished'
    : `${s.games.length} finished, ${results.won} won${s.winRate !== null ? ` (${Math.round(s.winRate * 100)}%)` : ''}`
  const subject = `Board games week: ${headline}`

  const stats = [
    `${s.games.length} finished`,
    `${results.won} won`, `${results.lost} lost`,
    ...(results.draws ? [`${results.draws} drawn`] : []),
    ...(results.coop ? [`${results.coop} co-op`] : []),
    ...(s.eloChange !== null ? [`ELO ${signed(s.eloChange)} on BGA`] : []),
  ].join(' · ')

  const finishedLines = s.games.map(g => {
    const place = placeLabel(g)
    const elo = g.elo !== undefined ? `ELO ${g.elo}${g.eloDelta ? ` (${signed(g.eloDelta)})` : ''}` : null
    return { g, detail: [PLATFORM_LABELS[g.platform], place, elo].filter(Boolean).join(' · ') }
  })

  const stalled = active
    .filter(g => !g.myTurn)
    .sort((a, b) => new Date(a.lastMoveAt).getTime() - new Date(b.lastMoveAt).getTime())
    .slice(0, MAX_STALLED)
    .map(g => ({ g, detail: `${PLATFORM_LABELS[g.platform]} · ${g.currentPlayer ?? 'opponent'}, last move ${formatTimeAgo(new Date(g.lastMoveAt))}` }))

  const waitingForMe = active.filter(g => g.myTurn).length
  const pace = options.pace && options.pace.turns > 0
    ? `My BGA pace: ${options.pace.turns} moves${options.pace.medianHours !== null ? `, median ${options.pace.medianHours}h to answer` : ''}${options.pace.turnsPerDay !== null ? `, ${options.pace.turnsPerDay} moves/day` : ''}.`
    : null
  const going = `${active.length} games going, ${waitingForMe} waiting for you.`

  const text = [
    stats, '',
    ...(finishedLines.length ? ['Finished this week', ...finishedLines.map(l => `• ${l.g.gameName} — ${l.detail}`), ''] : []),
    ...(pace ? [pace] : []),
    going, '',
    ...(stalled.length ? ['Stalled longest on opponents', ...stalled.map(l => `• ${l.g.gameName} — ${l.detail}\n  ${l.g.gameUrl}`)] : []),
  ].join('\n').trim()

  const list = (rows: { g: { gameName: string; gameUrl: string }; detail: string }[]) =>
    `<ul style="margin:0;padding-left:18px;font:14px sans-serif">${rows.map(r =>
      `<li style="margin:3px 0">${r.g.gameUrl ? `<a href="${esc(r.g.gameUrl)}">${esc(r.g.gameName)}</a>` : esc(r.g.gameName)} <span style="color:#888">${esc(r.detail)}</span></li>`).join('')}</ul>`
  const h3 = (t: string) => `<h3 style="margin:16px 0 6px;font:600 14px sans-serif">${esc(t)}</h3>`
  const html = [
    `<p style="font:600 15px sans-serif;margin:0 0 8px">${esc(stats)}</p>`,
    ...(finishedLines.length ? [h3('Finished this week'), list(finishedLines)] : []),
    ...(pace ? [`<p style="font:14px sans-serif">${esc(pace)}</p>`] : []),
    `<p style="font:14px sans-serif">${esc(going)}</p>`,
    ...(stalled.length ? [h3('Stalled longest on opponents'), list(stalled)] : []),
  ].join('')

  return { subject, text, html }
}
