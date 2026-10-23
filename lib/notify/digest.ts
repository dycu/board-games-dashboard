import { FinishedGame, PLATFORM_LABELS } from '../types'
import { summarizePeriod } from '../summary'
import { placeLabel } from '../results'
import { WeeklyPace } from './weekly'

export interface Digest { subject: string; text: string; html: string }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

// The morning email: what finished in the last 24h and how many moves I made
// (BGA pace, the only platform with real move history) — a look back instead
// of a to-do list, since the dashboard itself already shows what's waiting.
export function buildYesterdayDigest(finished: FinishedGame[], options: { now: number; pace?: WeeklyPace | null }): Digest {
  const to = new Date(options.now)
  const from = new Date(options.now - 86_400_000)
  const s = summarizePeriod(finished, from, to)
  const { results } = s

  const headline = s.games.length === 0
    ? 'no games finished'
    : `${s.games.length} finished, ${results.won} won${s.winRate !== null ? ` (${Math.round(s.winRate * 100)}%)` : ''}`
  const subject = `Board games yesterday: ${headline}`

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

  const pace = options.pace && options.pace.turns > 0
    ? `My BGA pace: ${options.pace.turns} move${options.pace.turns === 1 ? '' : 's'} yesterday${options.pace.medianHours !== null ? `, median ${options.pace.medianHours}h to answer` : ''}.`
    : null

  const text = [
    stats, '',
    ...(finishedLines.length ? ['Finished yesterday', ...finishedLines.map(l => `• ${l.g.gameName} — ${l.detail}`), ''] : []),
    ...(pace ? [pace] : []),
  ].join('\n').trim()

  const list = (rows: { g: { gameName: string; gameUrl: string }; detail: string }[]) =>
    `<ul style="margin:0;padding-left:18px;font:14px sans-serif">${rows.map(r =>
      `<li style="margin:3px 0">${r.g.gameUrl ? `<a href="${esc(r.g.gameUrl)}">${esc(r.g.gameName)}</a>` : esc(r.g.gameName)} <span style="color:#888">${esc(r.detail)}</span></li>`).join('')}</ul>`
  const html = [
    `<p style="font:600 15px sans-serif;margin:0 0 8px">${esc(stats)}</p>`,
    ...(finishedLines.length ? [`<h3 style="margin:16px 0 6px;font:600 14px sans-serif">Finished yesterday</h3>`, list(finishedLines)] : []),
    ...(pace ? [`<p style="font:14px sans-serif">${esc(pace)}</p>`] : []),
  ].join('')

  return { subject, text, html }
}
