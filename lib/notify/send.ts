import { kv } from '@vercel/kv'
import { getPrefs } from '../prefs'
import { getBacklog } from '../backlog/store'
import { listOf, backlogId } from '../backlog/list'
import { sendAlertEmail } from '../health/email'
import { buildDigest } from './digest'
import { dueSoon, deadlineEmail, Warned } from './deadlines'
import { StreamedGame } from './types'

const WARNED_KEY = 'deadline-warned:v1'

export async function sendDigest(games: StreamedGame[], now = Date.now()) {
  const [prefs, backlog] = await Promise.all([getPrefs(), getBacklog().catch(() => [])])
  const nextFromBacklog = backlog.find(item => listOf(item) === 'play'
    && !games.some(g => backlogId(g.platform, g.gameName) === item.id))
  const digest = buildDigest(games, { now, opponentSlowDays: prefs.opponentSlowDays ?? 5, nextFromBacklog })
  return { subject: digest.subject, email: await sendAlertEmail(digest.subject, digest.text, digest.html) }
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
