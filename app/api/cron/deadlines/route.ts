import { fetchGamesStream, cronAuthorization } from '@/lib/notify/stream'
import { sendDeadlineWarnings } from '@/lib/notify/send'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Several times a day (vercel.json): emails once per move that's due within
// 12h. Hobby-plan crons run at most daily, hence one entry per time slot.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const { games } = await fetchGamesStream(new URL(request.url).origin, cronAuthorization())
    return Response.json(await sendDeadlineWarnings(games))
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
