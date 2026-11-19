jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn(), hset: jest.fn(), hdel: jest.fn(), hincrby: jest.fn() } }))

import { kv } from '@vercel/kv'
import { attachMoveCounts, todayKey } from '../track'
import { Game } from '../../types'

const tracked = new Map<string, Record<string, unknown>>()

function game(id: string, myTurn: boolean, overrides: Partial<Game> = {}): Game {
  return {
    id, platform: 'obg', gameName: id, myTurn,
    lastMoveAt: new Date(), lastMoveAgo: '', urgent: false,
    gameUrl: '', platformUrl: '', players: [], ...overrides,
  }
}

const TODAY = '2026-11-19'
const YESTERDAY = '2026-11-18'

beforeEach(() => {
  jest.clearAllMocks()
  tracked.clear()
  // Noon UTC is safely inside the same Europe/Warsaw calendar day either
  // way, and past the 5am boundary — attachMoveCounts calls todayKey()
  // with no argument, so this must mock `new Date()` itself (not just
  // Date.now()) or these tests would depend on the real wall-clock hour.
  jest.useFakeTimers().setSystemTime(new Date(`${TODAY}T12:00:00Z`))
  ;(kv.hgetall as jest.Mock).mockImplementation(async (k: string) => tracked.get(k) ?? null)
  ;(kv.hset as jest.Mock).mockImplementation(async (k: string, v: Record<string, unknown>) => {
    tracked.set(k, { ...(tracked.get(k) ?? {}), ...v })
  })
  ;(kv.hdel as jest.Mock).mockImplementation(async (k: string, ...fields: string[]) => {
    const current = { ...(tracked.get(k) ?? {}) }
    for (const f of fields) delete current[f]
    tracked.set(k, current)
  })
  ;(kv.hincrby as jest.Mock).mockImplementation(async (k: string, field: string, amount: number) => {
    const current = { ...(tracked.get(k) ?? {}) }
    current[field] = (Number(current[field]) || 0) + amount
    tracked.set(k, current)
    return current[field]
  })
})

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

describe('todayKey', () => {
  it('formats as a Europe/Warsaw calendar date', () => {
    expect(todayKey(new Date(`${TODAY}T12:00:00Z`))).toBe(TODAY)
  })

  // November = CET = UTC+1, so Warsaw midnight is 23:00 UTC the day before
  it('still counts as yesterday just after midnight — the day boundary is 5am, not midnight', () => {
    expect(todayKey(new Date(`${YESTERDAY}T23:30:00Z`))).toBe(YESTERDAY) // 00:30 Warsaw
    expect(todayKey(new Date(`${TODAY}T03:30:00Z`))).toBe(YESTERDAY) // 04:30 Warsaw
  })

  it('rolls over to today once past the 5am boundary', () => {
    expect(todayKey(new Date(`${TODAY}T04:00:00Z`))).toBe(TODAY) // 05:00 Warsaw exactly
    expect(todayKey(new Date(`${TODAY}T04:30:00Z`))).toBe(TODAY) // 05:30 Warsaw
  })
})

describe('attachMoveCounts', () => {
  it('starts tracking a game the first time it is seen, with no count yet', async () => {
    const result = await attachMoveCounts('obg', [game('obg:1', true)])
    expect(result[0].moveCountToday).toBeUndefined()
    expect(tracked.get('movecounts:v1:obg')).toEqual({
      'obg:1': { myTurn: true, todayDate: TODAY, todayCount: 0 },
    })
  })

  it('counts a move once myTurn flips from true to false', async () => {
    tracked.set('movecounts:v1:obg', { 'obg:1': { myTurn: true, todayDate: TODAY, todayCount: 0 } })
    const result = await attachMoveCounts('obg', [game('obg:1', false)])
    expect(result[0].moveCountToday).toBe(1)
    expect(tracked.get('movecounts:v1:obg')).toEqual({
      'obg:1': { myTurn: false, todayDate: TODAY, todayCount: 1 },
    })
  })

  it('does not count the opponent moving the turn back to me', async () => {
    tracked.set('movecounts:v1:obg', { 'obg:1': { myTurn: false, todayDate: TODAY, todayCount: 2 } })
    const result = await attachMoveCounts('obg', [game('obg:1', true)])
    expect(result[0].moveCountToday).toBe(2)
    expect(tracked.get('movecounts:v1:obg')).toEqual({
      'obg:1': { myTurn: true, todayDate: TODAY, todayCount: 2 },
    })
  })

  it('does not write anything when nothing changed', async () => {
    tracked.set('movecounts:v1:obg', { 'obg:1': { myTurn: true, todayDate: TODAY, todayCount: 0 } })
    await attachMoveCounts('obg', [game('obg:1', true)])
    expect(kv.hset).not.toHaveBeenCalled()
  })

  it('resets the count on a new calendar day instead of carrying it over', async () => {
    tracked.set('movecounts:v1:obg', { 'obg:1': { myTurn: true, todayDate: YESTERDAY, todayCount: 5 } })
    const result = await attachMoveCounts('obg', [game('obg:1', false)])
    expect(result[0].moveCountToday).toBe(1)
    expect(tracked.get('movecounts:v1:obg')).toEqual({
      'obg:1': { myTurn: false, todayDate: TODAY, todayCount: 1 },
    })
  })

  it("credits yesterday's history with the final count before resetting it", async () => {
    tracked.set('movecounts:v1:obg', { 'obg:1': { myTurn: true, todayDate: YESTERDAY, todayCount: 5 } })
    await attachMoveCounts('obg', [game('obg:1', false)])
    // The move that landed on the rollover fetch belongs to today, not the
    // day being closed out — yesterday's history keeps its pre-move total.
    expect(tracked.get('movecounts-history:v1')).toEqual({ [YESTERDAY]: 5 })
  })

  it('sums several games rolling over on the same day into one history credit', async () => {
    tracked.set('movecounts:v1:obg', {
      'obg:1': { myTurn: false, todayDate: YESTERDAY, todayCount: 3 },
      'obg:2': { myTurn: false, todayDate: YESTERDAY, todayCount: 7 },
    })
    await attachMoveCounts('obg', [game('obg:1', false), game('obg:2', false)])
    expect(tracked.get('movecounts-history:v1')).toEqual({ [YESTERDAY]: 10 })
  })

  it('accumulates onto an existing history total instead of overwriting it', async () => {
    tracked.set('movecounts-history:v1', { [YESTERDAY]: 40 })
    tracked.set('movecounts:v1:obg', { 'obg:1': { myTurn: true, todayDate: YESTERDAY, todayCount: 5 } })
    await attachMoveCounts('obg', [game('obg:1', false)])
    expect(tracked.get('movecounts-history:v1')).toEqual({ [YESTERDAY]: 45 })
  })

  it('does not credit history for a day that never had any moves', async () => {
    tracked.set('movecounts:v1:obg', { 'obg:1': { myTurn: true, todayDate: YESTERDAY, todayCount: 0 } })
    await attachMoveCounts('obg', [game('obg:1', true)])
    expect(tracked.get('movecounts-history:v1')).toBeUndefined()
  })

  it('stops tracking a game once it disappears from the live list', async () => {
    tracked.set('movecounts:v1:obg', { 'obg:1': { myTurn: true, todayDate: TODAY, todayCount: 3 } })
    await attachMoveCounts('obg', [])
    expect(tracked.get('movecounts:v1:obg')).toEqual({})
  })

  it('leaves other platforms\' games untouched', async () => {
    const other = game('bga:1', true, { platform: 'bga' })
    const result = await attachMoveCounts('obg', [other])
    expect(result).toEqual([other])
    expect(tracked.size).toBe(0)
  })

  it('returns the games unchanged if a KV read fails, instead of losing the list', async () => {
    (kv.hgetall as jest.Mock).mockRejectedValueOnce(new Error('KV unavailable'))
    const games = [game('obg:1', true)]
    expect(await attachMoveCounts('obg', games)).toEqual(games)
  })
})
