import { computePaceStats, quantile, isAsync } from '../stats'
import { PaceTable } from '../store'
import { INITIAL_TURN_STATE, Turn } from '../bgaTurns'

const H = 3600
const D = 86400
const NOW = 1_800_000_000

const table = (id: string, start: number, end: number | null, extra: Partial<PaceTable> = {}): PaceTable => ({
  id, game: 'thecrew', start, end, history: 'done', state: INITIAL_TURN_STATE, ...extra,
})

describe('quantile', () => {
  it('interpolates', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([5], 0.9)).toBe(5)
  })
})

describe('isAsync', () => {
  it('excludes real-time and short finished games', () => {
    expect(isAsync(table('a', 0, 2 * H))).toBe(false)
    expect(isAsync(table('b', 0, 10 * D, { realtime: true }))).toBe(false)
    expect(isAsync(table('c', 0, 10 * D))).toBe(true)
    expect(isAsync(table('d', 0, null))).toBe(true)
  })
})

describe('computePaceStats', () => {
  it('attributes each turn to the number of async tables running when it started', () => {
    const tables = [
      table('1', NOW - 20 * D, null),
      table('2', NOW - 10 * D, null),
      table('rt', NOW - 15 * D, NOW - 15 * D + H), // real-time, ignored
    ]
    const turns: Record<string, Turn[]> = {
      '1': [[NOW - 15 * D, NOW - 15 * D + 2 * H], [NOW - 5 * D, NOW - 5 * D + 6 * H]],
      '2': [[NOW - 4 * D, NOW - 4 * D + 4 * H]],
      rt: [[NOW - 15 * D, NOW - 15 * D + 60]],
    }
    const s = computePaceStats(tables, turns, NOW)
    expect(s.byLoad).toEqual([
      { load: 1, n: 1, median: 2, p25: 2, p75: 2 },
      { load: 2, n: 2, median: 5, p25: 4.5, p75: 5.5 },
    ])
    expect(s.running).toBe(2)
    expect(s.recent.turns).toBe(3)
    expect(s.recent.medianHours).toBe(4)
  })

  it('lists games currently waiting on me, oldest first', () => {
    const tables = [
      table('1', NOW - 5 * D, null, { state: { ...INITIAL_TURN_STATE, openStart: NOW - H } }),
      table('2', NOW - 5 * D, null, { state: { ...INITIAL_TURN_STATE, openStart: NOW - 3 * H } }),
      table('3', NOW - 5 * D, null),
    ]
    const s = computePaceStats(tables, {}, NOW)
    expect(s.waiting.map(w => w.id)).toEqual(['2', '1'])
  })

  it('builds Monday-aligned weekly points with time-averaged load', () => {
    const monday = Date.UTC(2027, 0, 4) / 1000 // a Monday
    const now = monday + 14 * D
    const tables = [table('1', monday, null), table('2', monday + 7 * D, null)]
    const turns: Record<string, Turn[]> = { '1': [[monday + D, monday + D + H]], '2': [[monday + 8 * D, monday + 8 * D + 3 * H]] }
    const s = computePaceStats(tables, turns, now)
    expect(s.weekly.map(w => w.weekStart)).toEqual(['2027-01-04', '2027-01-11'])
    expect(s.weekly[0]).toMatchObject({ avgLoad: 1, medianHours: 1, n: 1 })
    expect(s.weekly[1]).toMatchObject({ avgLoad: 2, medianHours: 3, n: 1 })
  })

  it('finds the knee where the median climbs well above the light-load baseline', () => {
    const tables: PaceTable[] = []
    const turns: Record<string, Turn[]> = {}
    // 4 tables from day 0, 8 more join on day 100 → load 4, then 12
    for (let i = 0; i < 12; i++) tables.push(table(String(i), i < 4 ? NOW - 200 * D : NOW - 100 * D, null))
    let t = NOW - 199 * D
    for (let k = 0; k < 30; k++, t += D) (turns['0'] ??= []).push([t, t + 2 * H])   // load 4: 2h
    t = NOW - 99 * D
    for (let k = 0; k < 30; k++, t += D) (turns['5'] ??= []).push([t, t + 8 * H])   // load 12: 8h
    const s = computePaceStats(tables, turns, NOW)
    expect(s.knee).toBe(12)
  })

  it('returns empty stats when there is no data', () => {
    const s = computePaceStats([], {}, NOW)
    expect(s).toMatchObject({ running: 0, byLoad: [], weekly: [], knee: null, rule: null, firstTurnAt: null })
  })
})
