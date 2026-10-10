import { checkNewGames } from '@/lib/newGames/check'
import { SOURCES } from '@/lib/newGames/sources'
import { getSnapshot, setSnapshot, addEvents } from '@/lib/newGames/store'
import { sendAlertEmail } from '@/lib/health/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Temporary: manually run the real new-games check (real snapshot writes,
// real email) behind the app's own Basic Auth, without waiting for the
// next scheduled cron. Will be removed right after.
export async function GET() {
  const result = await checkNewGames({ sources: SOURCES, getSnapshot, setSnapshot, addEvents, sendEmail: sendAlertEmail })
  return Response.json(result)
}
