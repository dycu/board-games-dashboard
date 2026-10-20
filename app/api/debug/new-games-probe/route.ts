import { checkNewGames } from '@/lib/newGames/check'
import { SOURCES } from '@/lib/newGames/sources'
import { getSnapshot } from '@/lib/newGames/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Temporary: verify every new-games source works with current credentials
// (behind the app's own Basic Auth, no CRON_SECRET needed) without actually
// recording snapshots or sending email. Also lists any BGA alpha games the
// live catalog carries, to see directly whether they're genuinely new or
// already in the stored snapshot.
export async function GET() {
  const result = await checkNewGames({
    sources: SOURCES,
    getSnapshot,
    setSnapshot: async () => {},
    addEvents: async () => {},
    sendEmail: async () => ({ sent: false, reason: 'dry run' }),
  })
  const bgaSnapshot = await getSnapshot('bga')
  const bgaAlphaEvents = result.events.filter(e => e.source === 'bga' && e.status === 'alpha')
  return Response.json({
    counts: result.counts,
    errors: result.errors,
    baseline: result.baseline,
    newEvents: result.events.length,
    bgaAlphaEvents,
    bgaSnapshotSize: bgaSnapshot ? Object.keys(bgaSnapshot).length : null,
  })
}
