import { makeConnectors } from '@/lib/connectors'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Temporary: measures how long the real BGA connector takes right now,
// uncapped by the route's normal 12s per-platform timeout, to size a
// correct override instead of guessing. Protected by the app's own Basic
// Auth (middleware), not CRON_SECRET.
export async function GET() {
  const connectors = makeConnectors()
  const start = Date.now()
  try {
    const games = await connectors.bga()
    return Response.json({ ok: true, ms: Date.now() - start, count: games.length })
  } catch (e) {
    return Response.json({ ok: false, ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) })
  }
}
