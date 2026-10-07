import { syncBga } from '@/lib/pace/sync'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Daily Vercel Cron backstop for the pace logger, so BGA history keeps
// syncing on days the dashboard isn't opened. proxy.ts lets /api/cron/*
// through without Basic Auth; Vercel Cron sends this bearer token instead.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const progress = await syncBga(process.env.BGA_USERNAME ?? '', process.env.BGA_PASSWORD ?? '', 15000)
    return Response.json(progress)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
