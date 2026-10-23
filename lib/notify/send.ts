import { kv } from '@vercel/kv'
import { getPrefs } from '../prefs'
import { sendAlertEmail } from './email'
import { sendNtfy } from './ntfy'
import { buildYesterdayDigest } from './digest'
import { dueSoon, deadlineEmail, Warned } from './deadlines'
import { newlyMyTurn, WatchState } from './watch'
import { StreamedGame } from './types'
import { buildWeekly } from './weekly'
import { FinishedGame, PLATFORM_LABELS } from '../types'
import { getTables, getAllTurns } from '../pace/store'
import { computePaceStats } from '../pace/stats'

const WARNED_KEY = 'deadline-warned:v1'
const WATCH_STATE_KEY = 'watch-notified:v1'

// `finished` comes from /api/finished-games, with completedAt as an ISO string
function parseFinished(finished: unknown[]): FinishedGame[] {
  return (finished as (Omit<FinishedGame, 'completedAt'> & { completedAt: string })[])
    .map(g => ({ ...g, completedAt: new Date(g.completedAt) }))
}

export async function sendDigest(finished: unknown[], now = Date.now()) {
  const games = parseFinished(finished)
  let pace = null
  try {
    const tables = Object.values(await getTables())
    const turns = await getAllTurns(tables.map(t => t.id))
    pace = computePaceStats(tables, turns, Math.floor(now / 1000), 1).recent
  } catch {
    // the email works without the pace line
  }
  const digest = buildYesterdayDigest(games, { now, pace })
  return { subject: digest.subject, email: await sendAlertEmail(digest.subject, digest.text, digest.html) }
}

export async function sendWeekly(finished: unknown[], active: StreamedGame[], now = Date.now()) {
  const games = parseFinished(finished)
  let pace = null
  try {
    const tables = Object.values(await getTables())
    const turns = await getAllTurns(tables.map(t => t.id))
    pace = computePaceStats(tables, turns, Math.floor(now / 1000), 7).recent
  } catch {
    // the email works without the pace line
  }
  const weekly = buildWeekly(games, active, { now, pace })
  return { subject: weekly.subject, email: await sendAlertEmail(weekly.subject, weekly.text, weekly.html) }
}

export async function sendDeadlineWarnings(games: StreamedGame[], now = Date.now()) {
  const before = (await kv.get<Warned>(WARNED_KEY).catch(() => null)) ?? {}
  const { toWarn, warned } = dueSoon(games, before, now)
  let email: { sent: boolean; reason?: string } | null = null
  if (toWarn.length > 0) {
    const { subject, text } = deadlineEmail(toWarn, now)
    email = await sendAlertEmail(subject, text)
  }
  // Remember warnings only once they went out, so a failed send is retried next time
  if (toWarn.length === 0 || email?.sent) await kv.set(WARNED_KEY, warned).catch(() => {})
  return { warned: toWarn.map(g => g.id), email }
}

// Pushes an instant ntfy alert the moment a watched game flips to myTurn,
// rather than waiting for the twice-daily digest — see components/GameCard.tsx's
// watch button and app/api/cron/watch/route.ts
export async function sendWatchAlerts(games: StreamedGame[]) {
  const prefs = await getPrefs()
  const watchedIds = prefs.watchedGames ?? []
  if (watchedIds.length === 0) return { notified: [], ntfy: null }

  const before = (await kv.get<WatchState>(WATCH_STATE_KEY).catch(() => null)) ?? {}
  const { toNotify, state } = newlyMyTurn(games, watchedIds, before)

  let ntfy: { sent: boolean; reason?: string } | null = null
  if (toNotify.length > 0) {
    if (prefs.ntfyTopic) {
      const title = toNotify.length === 1 ? `🎲 ${toNotify[0].gameName}: your move` : `🎲 ${toNotify.length} watched games: your move`
      const message = toNotify.map(g => `${g.gameName} (${PLATFORM_LABELS[g.platform]})`).join('\n')
      const click = toNotify.length === 1 ? toNotify[0].gameUrl : undefined
      ntfy = await sendNtfy(prefs.ntfyTopic, title, message, click)
    } else {
      ntfy = { sent: false, reason: 'no ntfy topic configured' }
    }
  }

  // Only remember a game as "already notified" once the push actually went
  // out — same reasoning as deadline warnings above: an unsent push is
  // retried next time instead of being silently skipped forever
  const toNotifyIds = new Set(toNotify.map(g => g.id))
  const persisted = ntfy?.sent === false
    ? Object.fromEntries(Object.entries(state).filter(([id]) => !toNotifyIds.has(id)))
    : state
  await kv.set(WATCH_STATE_KEY, persisted).catch(() => {})

  return { notified: ntfy?.sent ? toNotify.map(g => g.id) : [], ntfy }
}
