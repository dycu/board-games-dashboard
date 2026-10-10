import { checkNewGames } from '@/lib/newGames/check'
import { SOURCES } from '@/lib/newGames/sources'
import { getSnapshot } from '@/lib/newGames/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Temporary: verify every new-games source works with current credentials
// (behind the app's own Basic Auth, no CRON_SECRET needed) without actually
// recording snapshots or sending email.
export async function GET() {
  const result = await checkNewGames({
    sources: SOURCES,
    getSnapshot,
    setSnapshot: async () => {},
    addEvents: async () => {},
    sendEmail: async () => ({ sent: false, reason: 'dry run' }),
  })
  return Response.json({ counts: result.counts, errors: result.errors, baseline: result.baseline, newEvents: result.events.length })
}
