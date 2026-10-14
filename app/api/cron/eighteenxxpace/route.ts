import { syncEighteenxx } from '@/lib/eighteenxxPace/sync'
import { getPrefs } from '@/lib/prefs'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Daily Vercel Cron backstop, so 18xx turn samples keep refreshing on days
// the dashboard isn't opened. proxy.ts lets /api/cron/* through without
// Basic Auth; Vercel Cron sends this bearer token instead.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const prefs = await getPrefs()
    const progress = await syncEighteenxx(
      process.env.EIGHTEENXX_USERNAME ?? '',
      process.env.EIGHTEENXX_PASSWORD ?? '',
      prefs.eighteenxxSessionCookie,
    )
    return Response.json(progress)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
