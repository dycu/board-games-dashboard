import { fetchFinishedYucata } from '@/lib/connectors/yucata'

// TEMPORARY — investigating a production timeout on Yucata's finished-games
// fetch (every per-step timeout under 10s individually, yet the whole chain
// exceeds 17s). This bypasses the route's own timeout entirely, up to
// Vercel's real edge ceiling, to measure the true total time or isolate
// exactly which step actually fails. Remove once diagnosed.
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  // Not under /api/cron/, so the dashboard's own Basic Auth middleware
  // (proxy.ts) already protects this like any other page/route.
  const username = process.env.YUCATA_USERNAME
  const password = process.env.YUCATA_PASSWORD
  if (!username || !password) return Response.json({ error: 'no credentials configured' }, { status: 500 })

  const startedAt = Date.now()
  try {
    const games = await fetchFinishedYucata(username, password)
    return Response.json({ ok: true, ms: Date.now() - startedAt, count: games.length })
  } catch (e) {
    return Response.json({
      ok: false,
      ms: Date.now() - startedAt,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
