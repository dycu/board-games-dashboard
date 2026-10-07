import { Turn } from './bgaTurns'
import { PaceTable } from './store'
import { REALTIME_MAX_SECONDS } from './sync'

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
  turnsPerDay: number      // my turns completed per day
  n: number
}

export interface PaceStats {
  running: number
  waiting: { id: string; game: string; since: number }[] // as of the last sync, oldest first
  recent: { days: number; turns: number; medianHours: number | null; p90Hours: number | null; turnsPerDay: number }
  byLoad: LoadBucket[]
  weekly: WeekPoint[]
  // Load where the median response clearly rises above the low-load baseline
  knee: number | null
  rule: { turnsPerGameDay: number; bestTurnsPerDay: number; suggestedGames: number } | null
  firstTurnAt: number | null
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

export function computePaceStats(
  allTables: PaceTable[],
  turnsByTable: Record<string, Turn[]>,
  now: number,
  recentDays = 30,
): PaceStats {
  const tables = allTables.filter(isAsync)
  const loadAt = makeLoadAt(tables, now)

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
  const recent = {
    days: recentDays,
    turns: recentResp.length,
    medianHours: recentResp.length ? round1(hours(quantile(recentResp, 0.5))) : null,
    p90Hours: recentResp.length ? round1(hours(quantile(recentResp, 0.9))) : null,
    turnsPerDay: round1(recentResp.length / recentDays),
  }

  // Response time by load
  const groups = new Map<number, number[]>()
  for (const t of turns) {
    if (!groups.has(t.load)) groups.set(t.load, [])
    groups.get(t.load)!.push(t.resp)
  }
  const byLoad: LoadBucket[] = [...groups.entries()]
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
      let loadSum = 0, samples = 0
      for (let h = ws; h < we; h += 3600) { loadSum += loadAt(h); samples++ }
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
        turnsPerDay: round1(days > 0 ? rs.length / days : 0),
        n: rs.length,
      })
    }
  }

  // Knee: baseline = median response over the lightest-loaded quarter of turns;
  // the knee is the lowest well-sampled load whose median is 1.5× that baseline
  let knee: number | null = null
  if (turns.length >= 40) {
    const byLoadAsc = [...turns].sort((a, b) => a.load - b.load)
    const light = byLoadAsc.slice(0, Math.ceil(byLoadAsc.length / 4)).map(t => t.resp).sort((a, b) => a - b)
    const baseline = hours(quantile(light, 0.5))
    const firstHigh = byLoad.find(b => b.n >= 15 && b.median > baseline * 1.5)
    knee = firstHigh ? firstHigh.load : null
  }

  // Rule of thumb over the recent window: turns each game hands me per day,
  // and the most turns/day I've sustained in a full week
  let rule: PaceStats['rule'] = null
  const gameDays = tables.reduce((sum, t) => {
    const from = Math.max(t.start, recentFrom)
    const to = Math.min(t.end ?? now, now)
    return sum + Math.max(0, to - from) / DAY
  }, 0)
  const fullWeeks = weekly.slice(0, -1).filter(w => w.n > 0)
  if (gameDays > 0 && recentResp.length > 0 && fullWeeks.length > 0) {
    const turnsPerGameDay = recentResp.length / gameDays
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
    rule,
    firstTurnAt: turns.length ? Math.min(...turns.map(t => t.start)) : null,
  }
}
