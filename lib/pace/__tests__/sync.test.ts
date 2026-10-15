jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn(), hgetall: jest.fn(), hset: jest.fn() } }))
jest.mock('../../connectors/bga', () => ({
  withBgaSession: jest.fn((_u: string, _p: string, fn: (s: unknown) => unknown) => fn({ myId: 'me123', cookies: {}, token: 't' })),
  fetchBgaTables: jest.fn().mockResolvedValue([]),
  bgaApiHeaders: jest.fn().mockReturnValue({}),
}))

import { kv } from '@vercel/kv'
import { syncBga } from '../sync'
import { PaceTable, PaceMeta } from '../store'

const mockFetch = jest.fn()
global.fetch = mockFetch
const mockGet = kv.get as jest.Mock
const mockSet = kv.set as jest.Mock
const mockHgetall = kv.hgetall as jest.Mock
const mockHset = kv.hset as jest.Mock

// Old enough that BGA's own archive is long gone (no packet re-read attempted)
// and clearly not a same-sitting realtime game.
const OLD_END = Math.floor(Date.now() / 1000) - 30 * 86400
const finishedRow = (id: string, offsetDays = 0) => ({
  table_id: id, game_name: 'thecrew', start: OLD_END - offsetDays * 86400 - 20000, end: OLD_END - offsetDays * 86400,
  cancelled: '0', players: 'a,b',
})

function mockGamesPage(rows: Record<string, any>[]) {
  mockFetch.mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ status: '1', data: { tables: rows } }) })
}

describe('syncBga: finished-table discovery', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockGet.mockReset()
    mockSet.mockReset()
    mockHgetall.mockReset()
    mockHset.mockReset()
  })

  it('keeps paging past a page that happens to be fully known already, instead of stopping there', async () => {
    const meta: PaceMeta = { trackingStartedAt: 0, lastSyncAt: 1000, indexComplete: true, nextIndexPage: 1 }
    mockGet.mockResolvedValue(meta)

    // Page 1 is made entirely of tables we already have — the old bug
    // treated this as proof there was nothing left to discover.
    const known: Record<string, PaceTable> = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => {
        const id = String(100 + i)
        return [id, { id, game: 'thecrew', start: OLD_END - 20000, end: OLD_END, history: 'done' as const, state: { lastPacketId: 0, active: [], openStart: null, lastTime: 0 } }]
      }),
    )
    mockHgetall.mockResolvedValue(known)

    const page1Rows = Array.from({ length: 10 }, (_, i) => finishedRow(String(100 + i)))
    const page2Rows = [finishedRow('201', 1)] // one genuinely new table, one page deeper
    mockGamesPage(page1Rows)
    mockGamesPage(page2Rows)
    mockGamesPage([]) // page 3: end of all history

    await syncBga('me', 'pass', 15000)

    const putCalls = mockHset.mock.calls.map(([, obj]) => obj)
    const everUpserted = Object.assign({}, ...putCalls)
    expect(everUpserted['201']).toBeDefined()
    expect(everUpserted['201']).toMatchObject({ id: '201', game: 'thecrew' })
  })

  it('stops once it reaches the backfill horizon', async () => {
    const meta: PaceMeta = { trackingStartedAt: 0, lastSyncAt: 1000, indexComplete: true, nextIndexPage: 1 }
    mockGet.mockResolvedValue(meta)
    mockHgetall.mockResolvedValue({})

    const veryOldEnd = Math.floor(Date.now() / 1000) - 800 * 86400 // past the 730-day horizon
    mockGamesPage([{ table_id: '1', game_name: 'thecrew', start: veryOldEnd - 20000, end: veryOldEnd, cancelled: '0', players: 'a,b' }])

    await syncBga('me', 'pass', 15000)
    expect(mockFetch).toHaveBeenCalledTimes(1) // stopped after the one page that crossed the horizon
    expect(mockSet).toHaveBeenCalledWith(expect.stringContaining('meta'), expect.objectContaining({ indexComplete: true }))
  })
})
