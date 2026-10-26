import { fetchGamesStream, cronAuthorization } from '@/lib/notify/stream'
import { sendWatchAlerts } from '@/lib/notify/send'
import { watchedPlatforms } from '@/lib/notify/watch'
import { getPrefs } from '@/lib/prefs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Not in vercel.json: Hobby-plan crons run at most once a day, too slow for
// "notify me the instant it's my turn" — this is pinged every ~15 min by an
// external scheduler (e.g. cron-job.org) hitting this URL with
// `Authorization: Bearer $WATCH_CRON_SECRET`. A secret of its own, not
// CRON_SECRET: Vercel's existing one was created as write-only, so its
// value can't be read back to hand to the external scheduler.
//
// At ~96 pings/day this was by far the biggest CPU cost in the app — it was
// fetching every platform every time, when almost always only one or two
// are actually being watched. Scoped to just those platforms' connectors
// (see /api/games's ?platforms= param), and skipped entirely when nothing
// is being watched.
export async function GET(request: Request) {
  const secret = process.env.WATCH_CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const watchedIds = (await getPrefs()).watchedGames ?? []
    if (watchedIds.length === 0) return Response.json({ notified: [], ntfy: null })

    const path = `/api/games?platforms=${watchedPlatforms(watchedIds).join(',')}`
    const { games } = await fetchGamesStream(new URL(request.url).origin, cronAuthorization(), path)
    return Response.json(await sendWatchAlerts(games))
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
