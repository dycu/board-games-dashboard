import { syncRally } from '@/lib/rallyPace/sync'

// Node, not edge: the live-state check connects a raw WebSocket (the `ws`
// package), which edge's fetch-only runtime can't do.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const progress = await syncRally(process.env.RALLY_USERNAME ?? '', process.env.RALLY_PASSWORD ?? '', 20000)
    return Response.json(progress)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
