import { fetchGamesStream, cronAuthorization } from '@/lib/notify/stream'
import { sendDigest } from '@/lib/notify/send'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Daily (06:00 UTC, vercel.json): the morning digest. proxy.ts lets
// /api/cron/* through without Basic Auth, so this checks CRON_SECRET itself
// and sends Basic Auth on to /api/games.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const { games, results, missing } = await fetchGamesStream(new URL(request.url).origin, cronAuthorization())
    const unavailable = [...missing, ...results.filter(r => 'error' in r).map(r => r.platform)]
    return Response.json(await sendDigest(games, unavailable))
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
