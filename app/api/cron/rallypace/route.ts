import { syncRally } from '@/lib/rallyPace/sync'

// Node, not edge: see /api/rallypace/sync — the live-state check needs a raw
// WebSocket connection.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Daily Vercel Cron backstop, so Rally turn tracking keeps going on days the
// dashboard isn't opened. proxy.ts lets /api/cron/* through without Basic
// Auth; Vercel Cron sends this bearer token instead.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const progress = await syncRally(process.env.RALLY_USERNAME ?? '', process.env.RALLY_PASSWORD ?? '', 15000)
    return Response.json(progress)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
