import { checkNewGames } from '@/lib/newGames/check'
import { SOURCES } from '@/lib/newGames/sources'
import { getSnapshot, setSnapshot, addEvents } from '@/lib/newGames/store'
import { sendAlertEmail } from '@/lib/health/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Twice a day (vercel.json): new games and release-stage changes on BGA, 18xx,
// Rally and Yucata, plus new Yucata blog posts. Emails what it finds; the
// dashboard shows the same events in a popup until dismissed.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const result = await checkNewGames({ sources: SOURCES, getSnapshot, setSnapshot, addEvents, sendEmail: sendAlertEmail })
    return Response.json(result)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
