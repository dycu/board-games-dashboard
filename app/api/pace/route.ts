import { kv } from '@vercel/kv'
import { getMeta, getTables, getAllTurns } from '@/lib/pace/store'
import { computePaceStats } from '@/lib/pace/stats'
import { getLoadSamples } from '@/lib/pace/loadSamples'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Same cache the BGA connector fills when resolving slugs to display names
const NAME_CACHE_PREFIX = 'bga-game-name:v1:'

export async function GET() {
  try {
    const [meta, tableMap, samples] = await Promise.all([getMeta(), getTables(), getLoadSamples()])
    const tables = Object.values(tableMap)
    const turns = await getAllTurns(tables.map(t => t.id))
    const stats = computePaceStats(tables, turns, Math.floor(Date.now() / 1000), 30, samples)

    const slugs = [...new Set(stats.waiting.map(w => w.game))]
    const names: Record<string, string> = {}
    if (slugs.length > 0) {
      const cached = await kv.mget<({ name: string | null } | null)[]>(...slugs.map(s => NAME_CACHE_PREFIX + s)).catch(() => [])
      slugs.forEach((s, i) => { names[s] = cached[i]?.name ?? s })
    }

    return Response.json({
      stats,
      names,
      sync: {
        lastSyncAt: meta.lastSyncAt,
        trackingStartedAt: meta.trackingStartedAt,
        indexComplete: meta.indexComplete,
        tables: tables.length,
        pendingHistory: tables.filter(t => t.history === 'pending').length,
      },
    })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
