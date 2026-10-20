import { checkNewGames } from '@/lib/newGames/check'
import { SOURCES } from '@/lib/newGames/sources'
import { getSnapshot, setSnapshot, addEvents } from '@/lib/newGames/store'
import { sendAlertEmail } from '@/lib/notify/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Manual run of the same check the twice-daily cron does (real snapshot
// writes, real email) — lets Settings offer "check now" instead of waiting
// for the next scheduled run.
export async function POST() {
  try {
    const result = await checkNewGames({ sources: SOURCES, getSnapshot, setSnapshot, addEvents, sendEmail: sendAlertEmail })
    return Response.json(result)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
