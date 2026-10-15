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

function knownTables(ids: string[]): Record<string, PaceTable> {
  return Object.fromEntries(ids.map(id => [
    id,
    { id, game: 'thecrew', start: OLD_END - 20000, end: OLD_END, history: 'done' as const, state: { lastPacketId: 0, active: [], openStart: null, lastTime: 0 } },
  ]))
}

function historyRowWrites(): Record<string, any> {
  const call = mockHset.mock.calls.find(([key]) => key === 'pace:v1:bga:history-rows')
  return call ? call[1] : {}
}

describe('syncBga: finished-table discovery', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockGet.mockReset()
    mockSet.mockReset()
    mockHgetall.mockReset()
    mockHset.mockReset()
  })

  it('keeps paging past a page that happens to be fully known already while still backfilling', async () => {
    const meta: PaceMeta = { trackingStartedAt: 0, lastSyncAt: 1000, indexComplete: false, nextIndexPage: 1, fullHistoryMigrated: true }
    mockGet.mockResolvedValue(meta)

    // Page 1 is made entirely of tables we already have — not yet a safe
    // signal to stop, since the account hasn't been walked to a genuinely
    // empty page yet.
    const ids = Array.from({ length: 10 }, (_, i) => String(100 + i))
    mockHgetall.mockResolvedValue(knownTables(ids))

    const page1Rows = ids.map(id => finishedRow(id))
    const page2Rows = [finishedRow('201', 1)] // one genuinely new table, one page deeper
    mockGamesPage(page1Rows)
    mockGamesPage(page2Rows)
    mockGamesPage([]) // page 3: genuinely out of history

    const progress = await syncBga('me', 'pass', 15000)

    const putCalls = mockHset.mock.calls.filter(([key]) => key === 'pace:v1:bga:tables').map(([, obj]) => obj)
    const everUpserted = Object.assign({}, ...putCalls)
    expect(everUpserted['201']).toBeDefined()
    expect(everUpserted['201']).toMatchObject({ id: '201', game: 'thecrew' })
    expect(progress.indexComplete).toBe(true)
    expect(historyRowWrites()['201']).toBeDefined()
  })

  it('stops as soon as a page is fully known, once the account has genuinely been walked to its end before', async () => {
    const meta: PaceMeta = { trackingStartedAt: 0, lastSyncAt: 1000, indexComplete: true, nextIndexPage: 1, fullHistoryMigrated: true }
    mockGet.mockResolvedValue(meta)

    const ids = Array.from({ length: 10 }, (_, i) => String(100 + i))
    mockHgetall.mockResolvedValue(knownTables(ids))

    mockGamesPage(ids.map(id => finishedRow(id))) // page 1: nothing new

    const progress = await syncBga('me', 'pass', 15000)

    expect(mockFetch).toHaveBeenCalledTimes(1) // never fetched a page 2
    expect(progress.stopReason).toBe('caught-up')
  })

  it('keeps paging past a fully-known page even once complete, as long as a later page still has something new', async () => {
    const meta: PaceMeta = { trackingStartedAt: 0, lastSyncAt: 1000, indexComplete: true, nextIndexPage: 1, fullHistoryMigrated: true }
    mockGet.mockResolvedValue(meta)
    mockHgetall.mockResolvedValue(knownTables(['100']))

    mockGamesPage([finishedRow('999')]) // page 1: a brand new finish, prepended ahead of the known one
    mockGamesPage([]) // page 2: genuinely out of history

    const progress = await syncBga('me', 'pass', 15000)

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(progress.stopReason).toBe('end-of-history')
    expect(historyRowWrites()['999']).toBeDefined()
  })

  it('stops once it genuinely runs out of history', async () => {
    const meta: PaceMeta = { trackingStartedAt: 0, lastSyncAt: 1000, indexComplete: false, nextIndexPage: 1, fullHistoryMigrated: true }
    mockGet.mockResolvedValue(meta)
    mockHgetall.mockResolvedValue({})

    mockGamesPage([finishedRow('1')])
    mockGamesPage([]) // genuinely empty page

    const progress = await syncBga('me', 'pass', 15000)

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(progress.indexComplete).toBe(true)
    expect(progress.stopReason).toBe('end-of-history')
  })

  it('captures a row even when pace already knew that table, so historyStore backfills for pre-existing tables too', async () => {
    const meta: PaceMeta = { trackingStartedAt: 0, lastSyncAt: 1000, indexComplete: false, nextIndexPage: 1, fullHistoryMigrated: true }
    mockGet.mockResolvedValue(meta)
    mockHgetall.mockResolvedValue(knownTables(['100'])) // pace already tracks this table's turn timing

    mockGamesPage([finishedRow('100')])
    mockGamesPage([]) // genuinely empty page

    await syncBga('me', 'pass', 15000)

    expect(historyRowWrites()['100']).toBeDefined() // still captured, despite already being known to pace
  })

  it('migrates stale pre-migration state: a stored indexComplete=true from before historyStore existed is not trusted', async () => {
    // Old meta shape — no fullHistoryMigrated field, indexComplete left over
    // from the previous (time-horizon) meaning
    const meta = { trackingStartedAt: 0, lastSyncAt: 1000, indexComplete: true, nextIndexPage: 999 } as PaceMeta
    mockGet.mockResolvedValue(meta)
    mockHgetall.mockResolvedValue(knownTables(['100'])) // already known to pace, but never captured into historyStore

    mockGamesPage([finishedRow('100')]) // page 1: looks fully known...
    mockGamesPage([]) // ...but the migration must not trust that and stop early

    const progress = await syncBga('me', 'pass', 15000)

    expect(mockFetch).toHaveBeenCalledTimes(2) // didn't stop at the "known" page 1
    expect(historyRowWrites()['100']).toBeDefined()
    expect(progress.indexComplete).toBe(true) // and ends up genuinely complete
  })
})
