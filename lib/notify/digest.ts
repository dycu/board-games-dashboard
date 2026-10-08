import { PLATFORM_LABELS } from '../types'
import { BacklogItem } from '../backlog/list'
import { formatTimeAgo, formatTimeRemaining } from '../connectors/utils'

// '5h', '2 days' — how long since `iso`, as of `now`
function since(iso: string, now: number): string {
  return formatTimeAgo(new Date(Date.now() - (now - new Date(iso).getTime()))).replace(/ ago$/, '')
}
import { StreamedGame } from './types'

const DEADLINE_SOON_MS = 24 * 3600 * 1000
const MAX_STALLED = 5

export interface Digest { subject: string; text: string; html: string }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// The morning email: what's waiting for me (most urgent first), which games
// have stalled on an opponent, and the next backlog game
export function buildDigest(games: StreamedGame[], options: { now: number; opponentSlowDays: number; nextFromBacklog?: BacklogItem }): Digest {
  const { now, opponentSlowDays } = options
  const left = (g: StreamedGame) => (g.deadlineAt ? new Date(g.deadlineAt).getTime() - now : Infinity)
  const mine = games.filter(g => g.myTurn).sort((a, b) =>
    Math.min(left(a), DEADLINE_SOON_MS) - Math.min(left(b), DEADLINE_SOON_MS)
    || new Date(a.lastMoveAt).getTime() - new Date(b.lastMoveAt).getTime())
  const stalled = games
    .filter(g => !g.myTurn && now - new Date(g.lastMoveAt).getTime() > opponentSlowDays * 86_400_000)
    .sort((a, b) => new Date(a.lastMoveAt).getTime() - new Date(b.lastMoveAt).getTime())
    .slice(0, MAX_STALLED)

  const mineLine = (g: StreamedGame) => {
    const parts = [`waiting ${since(g.lastMoveAt, now)}`]
    if (left(g) < DEADLINE_SOON_MS) parts.push(`⏱ ${formatTimeRemaining(Math.round(left(g) / 1000))}`)
    return { g, detail: parts.join(' · ') }
  }
  const stalledLine = (g: StreamedGame) => ({ g, detail: `${g.currentPlayer ?? 'opponent'} hasn't moved for ${since(g.lastMoveAt, now)}` })

  const sections: { title: string; rows: { g: StreamedGame; detail: string }[] }[] = [
    { title: mine.length ? `Your turn (${mine.length})` : 'Your turn: all caught up ✓', rows: mine.map(mineLine) },
  ]
  if (stalled.length) sections.push({ title: 'Stalled on opponents', rows: stalled.map(stalledLine) })

  const soon = mine.filter(g => left(g) < DEADLINE_SOON_MS).length
  const subject = mine.length === 0
    ? 'Board games: all caught up'
    : `Board games: ${mine.length} waiting for you${soon ? `, ${soon} due within a day` : ''}`

  const text = [
    ...sections.flatMap(s => [s.title, ...s.rows.map(r => `• ${r.g.gameName} (${PLATFORM_LABELS[r.g.platform]}) — ${r.detail}\n  ${r.g.gameUrl}`), '']),
    ...(options.nextFromBacklog ? [`Next from your backlog: ${options.nextFromBacklog.gameName} (${PLATFORM_LABELS[options.nextFromBacklog.platform]})\n  ${options.nextFromBacklog.playUrl}`] : []),
  ].join('\n').trim()

  const html = [
    ...sections.map(s => `<h3 style="margin:16px 0 6px;font:600 14px sans-serif">${esc(s.title)}</h3>`
      + (s.rows.length ? `<ul style="margin:0;padding-left:18px;font:14px sans-serif">${s.rows.map(r =>
        `<li style="margin:3px 0"><a href="${esc(r.g.gameUrl)}">${esc(r.g.gameName)}</a> <span style="color:#888">${esc(PLATFORM_LABELS[r.g.platform])} · ${esc(r.detail)}</span></li>`).join('')}</ul>` : '')),
    ...(options.nextFromBacklog ? [`<p style="font:14px sans-serif;margin-top:16px">Next from your backlog: <a href="${esc(options.nextFromBacklog.playUrl)}">${esc(options.nextFromBacklog.gameName)}</a> <span style="color:#888">${esc(PLATFORM_LABELS[options.nextFromBacklog.platform])}</span></p>`] : []),
  ].join('')

  return { subject, text, html }
}
