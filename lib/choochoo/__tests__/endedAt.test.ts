/**
 * @jest-environment node
 */
const store: Record<string, string> = {}
jest.mock('@vercel/kv', () => ({
  kv: {
    hgetall: jest.fn(async () => (Object.keys(store).length ? { ...store } : null)),
    hset: jest.fn(async (_key: string, values: Record<string, string>) => { Object.assign(store, values) }),
  },
}))

import { kv } from '@vercel/kv'
import { resolveEndedTimes } from '../endedAt'

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  jest.clearAllMocks()
})

describe('resolveEndedTimes', () => {
  it("reads each ended game's last turn start from its detail and parses Choochoo's date format", async () => {
    const fetchDetail = jest.fn(async (id: number) => ({
      turnStartTime: id === 1 ? 'Sun Oct 25 2026 15:40:07 GMT+0000 (Coordinated Universal Time)' : '2026-11-20T10:00:00.000Z',
    }))
    const times = await resolveEndedTimes([1, 2], fetchDetail)
    expect(times.get(1)?.toISOString()).toBe('2026-10-25T15:40:07.000Z')
    expect(times.get(2)?.toISOString()).toBe('2026-11-20T10:00:00.000Z')
  })

  it('remembers the times in KV, so an ended game is only looked up once', async () => {
    const fetchDetail = jest.fn(async () => ({ turnStartTime: '2026-11-20T10:00:00.000Z' }))
    await resolveEndedTimes([1, 2], fetchDetail)
    expect(fetchDetail).toHaveBeenCalledTimes(2)
    expect(kv.hset).toHaveBeenCalledTimes(1)

    fetchDetail.mockClear()
    const times = await resolveEndedTimes([1, 2, 3], fetchDetail)
    expect(fetchDetail).toHaveBeenCalledTimes(1)
    expect(fetchDetail).toHaveBeenCalledWith(3)
    expect(times.get(1)?.toISOString()).toBe('2026-11-20T10:00:00.000Z')
  })

  it('leaves a game out when its detail fails or has no usable time, without caching it', async () => {
    const fetchDetail = jest.fn(async (id: number) => {
      if (id === 1) throw new Error('boom')
      if (id === 2) return { turnStartTime: 'not a date' }
      return null
    })
    const times = await resolveEndedTimes([1, 2, 3], fetchDetail)
    expect(times.size).toBe(0)
    expect(kv.hset).not.toHaveBeenCalled()
  })

  it('still looks the times up when KV is unavailable', async () => {
    ;(kv.hgetall as jest.Mock).mockRejectedValueOnce(new Error('kv down'))
    ;(kv.hset as jest.Mock).mockRejectedValueOnce(new Error('kv down'))
    const times = await resolveEndedTimes([5], async () => ({ turnStartTime: '2026-11-01T00:00:00.000Z' }))
    expect(times.get(5)?.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })
})
