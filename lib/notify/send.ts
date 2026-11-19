import { sendAlertEmail } from './email'
import { buildYesterdayDigest } from './digest'
import { StreamedGame } from './types'
import { buildWeekly } from './weekly'
import { FinishedGame } from '../types'
import { getTables, getAllTurns } from '../pace/store'
import { computePaceStats } from '../pace/stats'

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
