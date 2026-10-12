jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn() } }))
jest.mock('@/lib/health/email', () => ({ sendAlertEmail: jest.fn(async () => ({ sent: true })) }))

import { kv } from '@vercel/kv'
import { parseGamesStream, runHealthCheck, readLastFailure } from '@/lib/health/run'

const ev = (o: object) => `data: ${JSON.stringify(o)}\n\n`

describe('parseGamesStream', () => {
  it('turns platform events into counts and errors', () => {
    const body = ev({ type: 'start', platforms: ['bga', 'obg'] })
      + ev({ type: 'platform', platform: 'bga', games: [{}, {}], error: null })
      + ev({ type: 'platform', platform: 'obg', games: [], error: 'OBG: markup has changed' })
      + ev({ type: 'done', fetchedAt: 'x' })
    expect(parseGamesStream(body)).toEqual({
      results: [
        { platform: 'bga', count: 2 },
        { platform: 'obg', error: 'OBG: markup has changed' },
      ],
      games: [{}, {}],
    })
  })

  it('throws on a stream cut short', () => {
    expect(() => parseGamesStream(ev({ type: 'start', platforms: [] }))).toThrow('done')
  })
})

describe('runHealthCheck', () => {
  const mockFetch = jest.fn()
  const mockKvSet = kv.set as jest.MockedFunction<typeof kv.set>

  beforeEach(() => {
    global.fetch = mockFetch
    mockFetch.mockReset()
    mockKvSet.mockReset().mockResolvedValue('OK' as never)
  })

  it('persists the failure to KV when the whole games stream fails to load', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    const report = await runHealthCheck('https://x', 'Basic abc')
    expect(report.results).toEqual([])
    expect(mockKvSet).toHaveBeenCalledWith(
      'health:lastFailure:v1',
      expect.objectContaining({ message: expect.stringContaining('HTTP 500') }),
    )
    const failureArg = mockKvSet.mock.calls.find(c => c[0] === 'health:lastFailure:v1')?.[1]
    expect(failureArg).toMatchObject({ at: report.checkedAt })
  })

  it('readLastFailure reads back what was stored', async () => {
    const mockKvGet = kv.get as jest.MockedFunction<typeof kv.get>
    mockKvGet.mockResolvedValueOnce({ at: '2026-10-12T06:00:00.000Z', message: 'boom' })
    await expect(readLastFailure()).resolves.toEqual({ at: '2026-10-12T06:00:00.000Z', message: 'boom' })
    expect(mockKvGet).toHaveBeenCalledWith('health:lastFailure:v1')
  })
})
