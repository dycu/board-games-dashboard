import { syncEighteenxx } from '@/lib/eighteenxxPace/sync'
import { getPrefs } from '@/lib/prefs'

// Edge is fine here — just HTTP fetch + KV, no WebSocket like Rally's.
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const prefs = await getPrefs()
    const progress = await syncEighteenxx(
      process.env.EIGHTEENXX_USERNAME ?? '',
      process.env.EIGHTEENXX_PASSWORD ?? '',
      prefs.eighteenxxSessionCookie,
      20000,
    )
    return Response.json(progress)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
