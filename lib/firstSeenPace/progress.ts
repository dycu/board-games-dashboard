import { Game, Platform } from '../types'
import { getTracked, putTracked, deleteTracked, getSamples, addSample, FirstSeenEntry } from './store'

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Reconciles what we're tracking against the live list: a game not tracked
// yet gets firstSeenAt = now (our own clock — see store.ts); one we were
// tracking that's no longer in the live list is assumed finished, and
// becomes a duration sample for its type before being dropped. Called on
// every fetch of this platform's games, so this is only as fresh as how
// often the dashboard (or a cron) actually asks — a game that starts and
// finishes entirely between two visits is never seen, and its finish just
// isn't recorded.
async function reconcile(platform: Platform, games: Game[]): Promise<Record<string, FirstSeenEntry>> {
  const tracked = await getTracked(platform)
  const liveIds = new Set(games.map(g => g.id))
  const now = Math.floor(Date.now() / 1000)

  const newlyTracked: Record<string, FirstSeenEntry> = {}
  for (const g of games) {
    if (!tracked[g.id]) newlyTracked[g.id] = { typeId: g.gameType ?? g.gameName, firstSeenAt: now }
  }
  await putTracked(platform, newlyTracked)

  const vanished = Object.entries(tracked).filter(([id]) => !liveIds.has(id))
  for (const [, entry] of vanished) {
    const duration = now - entry.firstSeenAt
    if (duration > 0) await addSample(platform, entry.typeId, duration)
  }
  await deleteTracked(platform, vanished.map(([id]) => id))

  return { ...tracked, ...newlyTracked }
}

function estimate(entry: FirstSeenEntry, samples: Record<string, number[]>, now: number): Game['progress'] | undefined {
  const pool = (samples[entry.typeId] ?? []).slice().sort((a, b) => a - b)
  if (pool.length === 0) return undefined
  const elapsedSeconds = now - entry.firstSeenAt
  if (elapsedSeconds <= 0) return undefined

  const estimatedTotalSeconds = median(pool)
  const percent = Math.max(0, Math.min(100, Math.round((elapsedSeconds / estimatedTotalSeconds) * 100)))
  return {
    percent,
    turnsSoFar: Math.round(elapsedSeconds),
    estimatedTotalTurns: Math.round(estimatedTotalSeconds),
    sampleCount: pool.length,
    samples: pool,
    sameSizeOnly: false,
    timeBased: true,
    selfTimed: true,
    etaSeconds: Math.max(0, estimatedTotalSeconds - elapsedSeconds),
  }
}

export interface FirstSeenActiveGameEta {
  id: string
  game: string // already a display name — no slug to resolve
  percent: number
  sampleCount: number
  timeBased?: boolean
  etaSeconds?: number
}

// Mirrors lib/pace/progress.ts's listActiveGameEtas, for the Pace page's
// "when are your active games likely to end" chart.
export async function listActiveFirstSeenGameEtas(platform: Platform, games: Game[]): Promise<FirstSeenActiveGameEta[]> {
  const relevant = games.filter(g => g.platform === platform)
  try {
    // No early return for an empty `relevant`: a game finishing (vanishing
    // from the live list) is exactly what reconcile() needs to see to record
    // its duration sample — skipping that here would mean finished games
    // are only ever noticed on a request where something *else* is still
    // active on this platform.
    const tracked = await reconcile(platform, relevant)
    const samples = await getSamples(platform)
    const now = Math.floor(Date.now() / 1000)

    return relevant
      .map(g => ({ g, progress: tracked[g.id] && estimate(tracked[g.id], samples, now) }))
      .filter((x): x is { g: Game; progress: NonNullable<Game['progress']> } => !!x.progress)
      .map(({ g, progress }) => ({
        id: g.id, game: g.gameType ?? g.gameName, percent: progress.percent,
        sampleCount: progress.sampleCount, timeBased: progress.timeBased, etaSeconds: progress.etaSeconds,
      }))
      .sort((a, b) => (a.etaSeconds ?? Infinity) - (b.etaSeconds ?? Infinity))
  } catch {
    return []
  }
}

// Attaches `progress` to every game of this platform in a live list, and
// does the tracking reconciliation (see reconcile() above) as a side effect
// — this is the one call site that needs to run on every fetch for the
// tracking to work at all.
export async function attachFirstSeenProgress(platform: Platform, games: Game[]): Promise<Game[]> {
  const relevant = games.filter(g => g.platform === platform)
  try {
    // See the comment in listActiveFirstSeenGameEtas — this must run even
    // when `relevant` is empty, so a game finishing is actually noticed.
    const tracked = await reconcile(platform, relevant)
    const samples = await getSamples(platform)
    const now = Math.floor(Date.now() / 1000)

    return games.map(g => {
      if (g.platform !== platform) return g
      const entry = tracked[g.id]
      const progress = entry && estimate(entry, samples, now)
      return progress ? { ...g, progress } : g
    })
  } catch {
    // A KV hiccup should just mean no progress bars this refresh, not that
    // the games themselves fail to show
    return games
  }
}
