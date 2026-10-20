import { checkNewGames } from '@/lib/newGames/check'
import { SOURCES } from '@/lib/newGames/sources'
import { getSnapshot } from '@/lib/newGames/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Temporary: list which BGA alpha games are currently new (not yet in the
// stored snapshot), without writing a snapshot or sending email — the
// evening cron hasn't run yet, so these aren't recorded as events yet.
export async function GET() {
  const result = await checkNewGames({
    sources: SOURCES,
    getSnapshot,
    setSnapshot: async () => {},
    addEvents: async () => {},
    sendEmail: async () => ({ sent: false, reason: 'dry run' }),
  })
  const bgaAlphaEvents = result.events.filter(e => e.source === 'bga' && e.status === 'alpha')
  return Response.json({ errors: result.errors, newEvents: result.events.length, bgaAlphaEvents })
}
