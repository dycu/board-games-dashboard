jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn(), hset: jest.fn(), hdel: jest.fn(), get: jest.fn(), set: jest.fn() } }))

import { kv } from '@vercel/kv'
import { attachFirstSeenProgress, listActiveFirstSeenGameEtas } from '../progress'
import { Game } from '../../types'

const tracked = new Map<string, Record<string, unknown>>()
const samples = new Map<string, Record<string, number[]>>()

function game(id: string, gameType: string, overrides: Partial<Game> = {}): Game {
  return {
    id, platform: 'obg', gameName: gameType, gameType, myTurn: false,
    lastMoveAt: new Date(), lastMoveAgo: '', urgent: false,
    gameUrl: '', platformUrl: '', players: [], ...overrides,
  }
}

beforeEach(() => {
  tracked.clear()
  samples.clear()
  jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
  ;(kv.hgetall as jest.Mock).mockImplementation(async (k: string) => tracked.get(k) ?? null)
  ;(kv.hset as jest.Mock).mockImplementation(async (k: string, v: Record<string, unknown>) => {
    tracked.set(k, { ...(tracked.get(k) ?? {}), ...v })
  })
  ;(kv.hdel as jest.Mock).mockImplementation(async (k: string, ...fields: string[]) => {
    const current = { ...(tracked.get(k) ?? {}) }
    for (const f of fields) delete current[f]
    tracked.set(k, current)
  })
  ;(kv.get as jest.Mock).mockImplementation(async (k: string) => samples.get(k) ?? null)
  ;(kv.set as jest.Mock).mockImplementation(async (k: string, v: Record<string, number[]>) => { samples.set(k, v) })
})

afterEach(() => jest.restoreAllMocks())

describe('attachFirstSeenProgress', () => {
  it('starts tracking a game the first time it is seen, with no progress yet', async () => {
    const games = [game('obg:1', 'Indonesia')]
    const result = await attachFirstSeenProgress('obg', games)
    expect(result[0].progress).toBeUndefined()
    expect(tracked.get('firstseenpace:v1:obg:tracked')).toMatchObject({
      'obg:1': { typeId: 'Indonesia', firstSeenAt: 1_700_000_000 },
    })
  })

  it('estimates percent/eta from the median duration of finished games of the same type, once tracked', async () => {
    tracked.set('firstseenpace:v1:obg:tracked', { 'obg:1': { typeId: 'Indonesia', firstSeenAt: 1_700_000_000 - 5000 } })
    samples.set('firstseenpace:v1:obg:samples', { Indonesia: [8000, 10000, 12000] })

    const result = await attachFirstSeenProgress('obg', [game('obg:1', 'Indonesia')])
    expect(result[0].progress).toMatchObject({
      percent: 50, turnsSoFar: 5000, estimatedTotalTurns: 10000, sampleCount: 3, timeBased: true, etaSeconds: 5000,
    })
  })

  it('returns the games unchanged if a KV read fails, instead of losing the list', async () => {
    (kv.hgetall as jest.Mock).mockRejectedValueOnce(new Error('KV unavailable'))
    const games = [game('obg:1', 'Indonesia')]
    expect(await attachFirstSeenProgress('obg', games)).toEqual(games)
  })

  it('leaves other platforms\' games untouched', async () => {
    const other = game('bga:1', 'Wingspan', { platform: 'bga' })
    const result = await attachFirstSeenProgress('obg', [other])
    expect(result).toEqual([other])
    expect(tracked.size).toBe(0)
  })

  it('records a duration sample once a tracked game disappears from the live list, and stops tracking it', async () => {
    tracked.set('firstseenpace:v1:obg:tracked', { 'obg:1': { typeId: 'Indonesia', firstSeenAt: 1_700_000_000 - 3600 } })

    await attachFirstSeenProgress('obg', []) // the game is gone — assumed finished

    expect(samples.get('firstseenpace:v1:obg:samples')).toEqual({ Indonesia: [3600] })
    expect(tracked.get('firstseenpace:v1:obg:tracked')).toEqual({})
  })

  it('appends to, and caps, a type\'s rolling sample window', async () => {
    tracked.set('firstseenpace:v1:obg:tracked', { 'obg:1': { typeId: 'Indonesia', firstSeenAt: 1_700_000_000 - 10 } })
    samples.set('firstseenpace:v1:obg:samples', { Indonesia: Array.from({ length: 30 }, (_, i) => i + 1) })

    await attachFirstSeenProgress('obg', [])

    const result = samples.get('firstseenpace:v1:obg:samples')!.Indonesia
    expect(result).toHaveLength(30)
    expect(result[0]).toBe(2) // the oldest (1) was dropped
    expect(result[29]).toBe(10) // the new sample (duration 10) lands last
  })
})

describe('listActiveFirstSeenGameEtas', () => {
  it('returns only games with an estimate, soonest finish first', async () => {
    tracked.set('firstseenpace:v1:obg:tracked', {
      'obg:1': { typeId: 'Indonesia', firstSeenAt: 1_700_000_000 - 9000 }, // close to done
      'obg:2': { typeId: 'Indonesia', firstSeenAt: 1_700_000_000 - 1000 }, // just started
      'obg:3': { typeId: 'NoSampleGame', firstSeenAt: 1_700_000_000 - 500 }, // no sample at all
    })
    samples.set('firstseenpace:v1:obg:samples', { Indonesia: [10000] })

    const result = await listActiveFirstSeenGameEtas('obg', [
      game('obg:1', 'Indonesia'), game('obg:2', 'Indonesia'), game('obg:3', 'NoSampleGame'),
    ])
    expect(result.map(r => r.id)).toEqual(['obg:1', 'obg:2'])
  })
})
