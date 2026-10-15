import { kv } from '@vercel/kv'
import { getMeta, getTables, getAllTurns } from '@/lib/pace/store'
import { computePaceStats } from '@/lib/pace/stats'
import { getLoadSamples } from '@/lib/pace/loadSamples'
import { listActiveGameEtas } from '@/lib/pace/progress'
import { getRallyGames } from '@/lib/rallyPace/store'
import { getEighteenxxPaceGames } from '@/lib/eighteenxxPace/store'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Same cache the BGA connector fills when resolving slugs to display names
const NAME_CACHE_PREFIX = 'bga-game-name:v1:'

// ?from=&to= (Unix seconds): only my BGA pace over that period, for History's summaries
export async function GET(request?: Request) {
  try {
    const [meta, tableMap, samples] = await Promise.all([getMeta(), getTables(), getLoadSamples()])
    const tables = Object.values(tableMap)
    const turns = await getAllTurns(tables.map(t => t.id))

    const params = request ? new URL(request.url).searchParams : null
    const from = Number(params?.get('from'))
    const to = Number(params?.get('to'))
    if (from > 0 && to > from) {
      const { recent } = computePaceStats(tables, turns, to, (to - from) / 86400, samples)
      return Response.json({ recent, trackingStartedAt: meta.trackingStartedAt })
    }

    const stats = computePaceStats(tables, turns, Math.floor(Date.now() / 1000), 30, samples)
    const activeEtas = listActiveGameEtas(tableMap)

    const slugs = [...new Set([...stats.waiting.map(w => w.game), ...activeEtas.map(g => g.game)])]
    const names: Record<string, string> = {}
    if (slugs.length > 0) {
      const cached = await kv.mget<({ name: string | null } | null)[]>(...slugs.map(s => NAME_CACHE_PREFIX + s)).catch(() => [])
      slugs.forEach((s, i) => { names[s] = cached[i]?.name ?? s })
    }

    // How much history each platform's tracker actually has to work with —
    // a quick way to tell "no bar because no data yet" apart from "something's
    // wrong", without reaching for a one-off debug route each time.
    const [rallyGames, eighteenxxGames] = await Promise.all([
      getRallyGames().catch(() => ({})),
      getEighteenxxPaceGames().catch(() => ({})),
    ])
    const rally = Object.values(rallyGames)
    const eighteenxx = Object.values(eighteenxxGames)
    const health = {
      bga: { tracked: tables.length, finishedWithSample: tables.filter(t => t.end !== null && (t.totalTurnState?.count ?? 0) > 0).length },
      rally: { tracked: rally.length, finishedWithSample: rally.filter(g => g.end !== null && (g.turn ?? 0) > 0).length },
      eighteenxx: { tracked: eighteenxx.length, finishedWithSample: eighteenxx.filter(g => g.end !== null && (g.actionCount ?? 0) > 0).length },
      hansa: null, // no stored tracker — the median is recomputed live from the public API on every request
    }

    return Response.json({
      stats,
      names,
      activeEtas,
      health,
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
