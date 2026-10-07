import { Turn } from './bgaTurns'
import { PaceTable } from './store'
import { REALTIME_MAX_SECONDS } from './sync'
import { LoadSample } from './loadSamples'

const DAY = 86400
const WEEK = 7 * DAY

export interface LoadBucket {
  load: number   // async BGA tables running when the turn started
  n: number
  median: number // hours
  p25: number
  p75: number
}

export interface WeekPoint {
  weekStart: string        // ISO date (Monday, UTC)
  avgLoad: number          // time-averaged running async tables
  medianHours: number | null
  // My turns completed per day, scaled up for game time without move history.
  // null when under half the week's game time has history.
  turnsPerDay: number | null
  coverage: number         // share of the week's async game time with move history
  n: number
}

export interface PaceStats {
  running: number
  waiting: { id: string; game: string; since: number }[] // as of the last sync, oldest first
  recent: { days: number; turns: number; medianHours: number | null; p90Hours: number | null; turnsPerDay: number | null; coverage: number }
  byLoad: LoadBucket[]
  weekly: WeekPoint[]
  // Load where the median response clearly rises above the low-load baseline
  knee: number | null
  // Same, with load = BGA games + games on every other platform. Only turns
  // since load snapshots began (allPlatformsSince) can be placed.
  byTotalLoad: LoadBucket[]
  kneeTotal: number | null
  allPlatformsSince: number | null
  otherNow: number | null  // non-BGA games running per the latest snapshot
  rule: { turnsPerGameDay: number; bestTurnsPerDay: number; suggestedGames: number } | null
  firstTurnAt: number | null
}

// BGA archives a finished table's move log within hours, so only tables read
// while running have turns. Turn counts are scaled by this coverage.
export function hasHistory(t: PaceTable): boolean {
  return t.state.lastPacketId > 0
}

// Coverage below this is too thin to estimate a per-day turn count from
const MIN_COVERAGE = 0.5

function gameDaysIn(tables: PaceTable[], from: number, to: number): number {
  return tables.reduce((sum, t) => sum + Math.max(0, Math.min(t.end ?? to, to) - Math.max(t.start, from)) / DAY, 0)
}

export function isAsync(t: PaceTable): boolean {
  if (t.realtime) return false
  return t.end === null || t.end - t.start >= REALTIME_MAX_SECONDS
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

// Number of tables running at time t, from sorted start/end times
function makeLoadAt(tables: PaceTable[], now: number) {
  const starts = tables.map(t => t.start).sort((a, b) => a - b)
  const ends = tables.map(t => t.end ?? now).sort((a, b) => a - b)
  const countLE = (arr: number[], t: number) => {
    let lo = 0, hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid] <= t) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  return (t: number) => countLE(starts, t) - countLE(ends, t)
}

const hours = (sec: number) => sec / 3600
const round1 = (x: number) => Math.round(x * 10) / 10

// A snapshot's non-BGA count is trusted for this long; beyond it (dashboard
// not opened) the other platforms' load is unknown
const SAMPLE_HOLD_SECONDS = 48 * 3600

// Non-BGA games running at time t, from load snapshots. A platform missing
// from a snapshot (it errored) keeps its last known count.
export function makeOtherLoadAt(samples: LoadSample[]): (t: number) => number | null {
  const sorted = [...samples].sort((a, b) => a.t - b.t)
  const last: Record<string, number> = {}
  const times: number[] = []
  const totals: number[] = []
  for (const s of sorted) {
    for (const [p, n] of Object.entries(s.counts)) if (n != null) last[p] = n
    times.push(s.t)
    totals.push(Object.entries(last).reduce((sum, [p, n]) => (p === 'bga' ? sum : sum + n), 0))
  }
  return (t: number) => {
    let lo = 0, hi = times.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (times[mid] <= t) lo = mid + 1
      else hi = mid
    }
    const i = lo - 1
    if (i < 0 || t - times[i] > SAMPLE_HOLD_SECONDS) return null
    return totals[i]
  }
}

function bucketByLoad(turns: { load: number; resp: number }[]): LoadBucket[] {
  const groups = new Map<number, number[]>()
  for (const t of turns) {
    if (!groups.has(t.load)) groups.set(t.load, [])
    groups.get(t.load)!.push(t.resp)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([load, rs]) => {
      const s = rs.sort((a, b) => a - b)
      return {
        load,
        n: s.length,
        median: round1(hours(quantile(s, 0.5))),
        p25: round1(hours(quantile(s, 0.25))),
        p75: round1(hours(quantile(s, 0.75))),
      }
    })
}

// Knee: baseline = median response over the lightest-loaded quarter of turns;
// the knee is the lowest well-sampled load whose median is 1.5× that baseline
function findKnee(turns: { load: number; resp: number }[], buckets: LoadBucket[]): number | null {
  if (turns.length < 40) return null
  const byLoadAsc = [...turns].sort((a, b) => a.load - b.load)
  const light = byLoadAsc.slice(0, Math.ceil(byLoadAsc.length / 4)).map(t => t.resp).sort((a, b) => a - b)
  const baseline = hours(quantile(light, 0.5))
  return buckets.find(b => b.n >= 15 && b.median > baseline * 1.5)?.load ?? null
}

export function computePaceStats(
  allTables: PaceTable[],
  turnsByTable: Record<string, Turn[]>,
  now: number,
  recentDays = 30,
  loadSamples: LoadSample[] = [],
): PaceStats {
  const tables = allTables.filter(isAsync)
  const loadAt = makeLoadAt(tables, now)
  const covered = tables.filter(hasHistory)
  const coveredLoadAt = makeLoadAt(covered, now)

  const turns = tables.flatMap(t =>
    (turnsByTable[t.id] ?? [])
      .filter(([s, e]) => e >= s)
      .map(([start, end]) => ({ start, end, resp: end - start, load: loadAt(start) })),
  )
  turns.sort((a, b) => a.end - b.end)

  // Waiting on me now
  const running = tables.filter(t => t.end === null)
  const waiting = running
    .filter(t => t.state.openStart !== null)
    .map(t => ({ id: t.id, game: t.game, since: t.state.openStart! }))
    .sort((a, b) => a.since - b.since)

  // Recent window
  const recentFrom = now - recentDays * DAY
  const recentResp = turns.filter(t => t.end >= recentFrom).map(t => t.resp).sort((a, b) => a - b)
  const allGameDays = gameDaysIn(tables, recentFrom, now)
  const coveredGameDays = gameDaysIn(covered, recentFrom, now)
  const recentCoverage = allGameDays > 0 ? coveredGameDays / allGameDays : 0
  const recent = {
    days: recentDays,
    turns: recentResp.length,
    medianHours: recentResp.length ? round1(hours(quantile(recentResp, 0.5))) : null,
    p90Hours: recentResp.length ? round1(hours(quantile(recentResp, 0.9))) : null,
    turnsPerDay: recentCoverage >= MIN_COVERAGE ? round1(recentResp.length / recentDays / recentCoverage) : null,
    coverage: Math.round(recentCoverage * 100) / 100,
  }

  // Response time by load
  const byLoad = bucketByLoad(turns)

  // ...and by load across all platforms, for turns a snapshot covers
  const otherLoadAt = makeOtherLoadAt(loadSamples)
  const totalTurns = turns.flatMap(t => {
    const other = otherLoadAt(t.start)
    return other === null ? [] : [{ load: t.load + other, resp: t.resp }]
  })
  const byTotalLoad = bucketByLoad(totalTurns)

  // Weekly series (Monday-aligned, UTC), from the first turn to now
  const weekly: WeekPoint[] = []
  if (turns.length > 0) {
    const first = Math.min(...turns.map(t => t.start))
    const firstDate = new Date(first * 1000)
    const dow = (firstDate.getUTCDay() + 6) % 7
    let ws = Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), firstDate.getUTCDate() - dow) / 1000
    let ti = 0
    for (; ws < now; ws += WEEK) {
      const we = Math.min(ws + WEEK, now)
      let loadSum = 0, coveredSum = 0, samples = 0
      for (let h = ws; h < we; h += 3600) { loadSum += loadAt(h); coveredSum += coveredLoadAt(h); samples++ }
      const coverage = loadSum > 0 ? coveredSum / loadSum : 0
      const rs: number[] = []
      while (ti < turns.length && turns[ti].end < ws + WEEK) {
        if (turns[ti].end >= ws) rs.push(turns[ti].resp)
        ti++
      }
      rs.sort((a, b) => a - b)
      const days = (we - ws) / DAY
      weekly.push({
        weekStart: new Date(ws * 1000).toISOString().slice(0, 10),
        avgLoad: round1(samples ? loadSum / samples : 0),
        medianHours: rs.length ? round1(hours(quantile(rs, 0.5))) : null,
        turnsPerDay: days > 0 && coverage >= MIN_COVERAGE ? round1(rs.length / days / coverage) : null,
        coverage: Math.round(coverage * 100) / 100,
        n: rs.length,
      })
    }
  }

  const knee = findKnee(turns, byLoad)
  const kneeTotal = findKnee(totalTurns, byTotalLoad)

  // Rule of thumb over the recent window: turns each game hands me per day
  // (from games with move history), and the most turns/day I've sustained in a full week
  let rule: PaceStats['rule'] = null
  const fullWeeks = weekly.slice(0, -1).filter((w): w is WeekPoint & { turnsPerDay: number } => w.n > 0 && w.turnsPerDay !== null)
  if (coveredGameDays > 0 && recentResp.length > 0 && fullWeeks.length > 0) {
    const turnsPerGameDay = recentResp.length / coveredGameDays
    const bestTurnsPerDay = Math.max(...fullWeeks.map(w => w.turnsPerDay))
    rule = {
      turnsPerGameDay: Math.round(turnsPerGameDay * 100) / 100,
      bestTurnsPerDay,
      suggestedGames: Math.floor((0.75 * bestTurnsPerDay) / turnsPerGameDay),
    }
  }

  return {
    running: running.length,
    waiting,
    recent,
    byLoad,
    weekly,
    knee,
    byTotalLoad,
    kneeTotal,
    allPlatformsSince: loadSamples.length ? Math.min(...loadSamples.map(s => s.t)) : null,
    otherNow: otherLoadAt(now),
    rule,
    firstTurnAt: turns.length ? Math.min(...turns.map(t => t.start)) : null,
  }
}
