import { kv } from '@vercel/kv'
import { getMeta, getTables, getAllTurns } from '@/lib/pace/store'
import { computePaceStats } from '@/lib/pace/stats'
import { getLoadSamples } from '@/lib/pace/loadSamples'
import { listActiveGameEtas } from '@/lib/pace/progress'
import { getRallyGames } from '@/lib/rallyPace/store'
import { getEighteenxxPaceGames } from '@/lib/eighteenxxPace/store'
import { listActiveEighteenxxGameEtas } from '@/lib/eighteenxxPace/progress'
import { listActiveHansaGameEtas } from '@/lib/connectors/hansa'

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

    // How much history each platform's tracker actually has to work with —
    // a quick way to tell "no bar because no data yet" apart from "something's
    // wrong", without reaching for a one-off debug route each time. Also
    // doubles as the source for each platform's own active-game ETAs below.
    const [rallyGames, eighteenxxGames, hansaEtas] = await Promise.all([
      getRallyGames().catch(() => ({})),
      getEighteenxxPaceGames().catch(() => ({})),
      listActiveHansaGameEtas(process.env.HANSA_USER_ID ?? '').catch(() => []),
    ])
    const rally = Object.values(rallyGames)
    const eighteenxx = Object.values(eighteenxxGames)

    // Combined across every platform with an ETA-capable tracker. Rally has
    // no accessible game-start timestamp (lib/rallyPace/progress.ts), so it
    // can't project a finish time and stays out of this chart. Each table id
    // is only unique within its own platform's tracker, so it's prefixed
    // here the same way Game.id/FinishedGame.id already are elsewhere.
    const activeEtas = [
      ...listActiveGameEtas(tableMap).map(g => ({ ...g, id: `bga:${g.id}`, platform: 'bga' as const })),
      ...listActiveEighteenxxGameEtas(eighteenxxGames).map(g => ({ ...g, id: `eighteenxx:${g.id}`, platform: 'eighteenxx' as const })),
      ...hansaEtas.map(g => ({ ...g, id: `hansa:${g.id}`, platform: 'hansa' as const })),
    ].sort((a, b) => (a.etaSeconds ?? Infinity) - (b.etaSeconds ?? Infinity))

    // Only BGA's `game` is a slug needing this cache — 18xx/Hansa entries are
    // already a display title, so they're left out rather than queried for nothing
    const slugs = [...new Set([...stats.waiting.map(w => w.game), ...activeEtas.filter(g => g.platform === 'bga').map(g => g.game)])]
    const names: Record<string, string> = {}
    if (slugs.length > 0) {
      const cached = await kv.mget<({ name: string | null } | null)[]>(...slugs.map(s => NAME_CACHE_PREFIX + s)).catch(() => [])
      slugs.forEach((s, i) => { names[s] = cached[i]?.name ?? s })
    }

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
