import { fetchGamesStream } from '@/lib/health/run'
import { sendWeekly } from '@/lib/notify/send'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Sundays 17:00 UTC (vercel.json): the week's results, ELO, pace and stalled games
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const origin = new URL(request.url).origin
  const basic = `Basic ${Buffer.from(`${process.env.AUTH_USERNAME ?? ''}:${process.env.AUTH_PASSWORD ?? ''}`).toString('base64')}`
  try {
    const [finished, active] = await Promise.all([
      fetchGamesStream(origin, basic, '/api/finished-games'),
      fetchGamesStream(origin, basic),
    ])
    return Response.json(await sendWeekly(finished.games, active.games))
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
