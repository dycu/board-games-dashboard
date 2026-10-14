import { fetchGamesStream, cronAuthorization } from '@/lib/notify/stream'
import { sendWatchAlerts } from '@/lib/notify/send'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Not in vercel.json: Hobby-plan crons run at most once a day, too slow for
// "notify me the instant it's my turn" — this is pinged every ~15 min by an
// external scheduler (e.g. cron-job.org) hitting this URL with
// `Authorization: Bearer $CRON_SECRET`, same auth as the other crons.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const { games } = await fetchGamesStream(new URL(request.url).origin, cronAuthorization())
    return Response.json(await sendWatchAlerts(games))
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
