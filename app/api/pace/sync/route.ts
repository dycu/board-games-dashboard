import { syncBga } from '@/lib/pace/sync'

// Edge, like /api/games: BGA is reachable from it, and the work is
// time-budgeted to finish well inside the edge response deadline.
// The Pace page calls this repeatedly until the backfill is done.
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const progress = await syncBga(process.env.BGA_USERNAME ?? '', process.env.BGA_PASSWORD ?? '', 15000)
    return Response.json(progress)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
