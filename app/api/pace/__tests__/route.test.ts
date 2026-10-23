/**
 * @jest-environment node
 */
jest.mock('@vercel/kv', () => ({ kv: { mget: jest.fn().mockResolvedValue([]) } }))
jest.mock('@/lib/pace/store', () => ({
  getMeta: jest.fn(),
  getTables: jest.fn(),
  getAllTurns: jest.fn(),
}))
jest.mock('@/lib/pace/loadSamples', () => ({ getLoadSamples: jest.fn() }))
jest.mock('@/lib/rallyPace/store', () => ({ getRallyGames: jest.fn() }))
jest.mock('@/lib/eighteenxxPace/store', () => ({ getEighteenxxPaceGames: jest.fn() }))
jest.mock('@/lib/connectors/hansa', () => ({ listActiveHansaGameEtas: jest.fn() }))
jest.mock('@/lib/firstSeenPace/store', () => ({ getTracked: jest.fn(), getSamples: jest.fn() }))
jest.mock('@/lib/firstSeenPace/progress', () => ({ listTrackedFirstSeenGameEtas: jest.fn() }))

import { getMeta, getTables, getAllTurns } from '@/lib/pace/store'
import { getLoadSamples } from '@/lib/pace/loadSamples'
import { getRallyGames } from '@/lib/rallyPace/store'
import { getEighteenxxPaceGames } from '@/lib/eighteenxxPace/store'
import { listActiveHansaGameEtas } from '@/lib/connectors/hansa'
import { getTracked, getSamples } from '@/lib/firstSeenPace/store'
import { listTrackedFirstSeenGameEtas } from '@/lib/firstSeenPace/progress'
import { GET } from '../route'
import { PaceTable } from '@/lib/pace/store'
import { INITIAL_TURN_STATE } from '@/lib/pace/bgaTurns'

const mockGetMeta = getMeta as jest.Mock
const mockGetTables = getTables as jest.Mock
const mockGetAllTurns = getAllTurns as jest.Mock
const mockGetLoadSamples = getLoadSamples as jest.Mock
const mockGetRallyGames = getRallyGames as jest.Mock
const mockGetEighteenxxPaceGames = getEighteenxxPaceGames as jest.Mock
const mockListActiveHansaGameEtas = listActiveHansaGameEtas as jest.Mock
const mockGetTracked = getTracked as jest.Mock
const mockGetSamples = getSamples as jest.Mock
const mockListTrackedFirstSeenGameEtas = listTrackedFirstSeenGameEtas as jest.Mock

const NOW = Math.floor(Date.now() / 1000)
const table = (id: string, game: string, end: number | null, turnCount: number | null, extra: Partial<PaceTable> = {}): PaceTable => ({
  id, game, start: NOW - 86400, end, history: end === null ? 'synced' : 'done', state: INITIAL_TURN_STATE,
  ...(turnCount !== null && { totalTurnState: { lastPacketId: 0, lastActivePlayer: null, count: turnCount } }),
  ...extra,
})

describe('GET /api/pace', () => {
  beforeEach(() => {
    mockGetMeta.mockResolvedValue({ trackingStartedAt: 0, lastSyncAt: NOW, indexComplete: true, nextIndexPage: 1 })
    mockGetAllTurns.mockResolvedValue({})
    mockGetLoadSamples.mockResolvedValue([])
    mockGetRallyGames.mockResolvedValue({ r1: { id: 'r1', game: 'maria', end: 1000, turn: 20 } })
    mockGetEighteenxxPaceGames.mockResolvedValue({ e1: { id: 'e1', title: '1846', end: 1000, actionCount: 0 } })
    mockListActiveHansaGameEtas.mockResolvedValue([])
    mockGetTracked.mockResolvedValue({})
    mockGetSamples.mockResolvedValue({})
    mockListTrackedFirstSeenGameEtas.mockResolvedValue([])
  })

  it('reports an active game with an estimate in activeEtas, soonest first', async () => {
    mockGetTables.mockResolvedValue({
      active: table('active', 'thecrew', null, 5),
      f1: table('f1', 'thecrew', 1000, 30),
    })

    const res = await GET()
    const json = await res.json()
    expect(json.activeEtas).toHaveLength(1)
    expect(json.activeEtas[0]).toMatchObject({ id: 'bga:active', platform: 'bga', game: 'thecrew' })
  })

  it('includes active games from the 18xx and Hansa trackers too, not just BGA', async () => {
    mockGetTables.mockResolvedValue({})
    mockGetEighteenxxPaceGames.mockResolvedValue({
      active18xx: { id: 'active18xx', title: '1846', end: null, actionCount: 60, start: NOW - 86400 },
      f1: { id: 'f1', title: '1846', end: 1000, actionCount: 120 },
    })
    mockListActiveHansaGameEtas.mockResolvedValue([
      { id: 'hgame1', game: 'Hansa Teutonica', percent: 40, sampleCount: 5, etaSeconds: 12345 },
    ])

    const res = await GET()
    const json = await res.json()
    const byId = Object.fromEntries(json.activeEtas.map((g: any) => [g.id, g]))
    expect(byId['eighteenxx:active18xx']).toMatchObject({ platform: 'eighteenxx', game: '1846' })
    expect(byId['hansa:hgame1']).toMatchObject({ platform: 'hansa', game: 'Hansa Teutonica', etaSeconds: 12345 })
  })

  it('passes HANSA_USER_ID through to the Hansa tracker and still responds if it rejects', async () => {
    mockGetTables.mockResolvedValue({})
    mockListActiveHansaGameEtas.mockRejectedValue(new Error('hansa down'))

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.activeEtas.some((g: any) => g.platform === 'hansa')).toBe(false)
  })

  it('reports per-platform tracker health counts', async () => {
    mockGetTables.mockResolvedValue({
      f1: table('f1', 'thecrew', 1000, 30),
      f2: table('f2', 'thecrew', 1000, 0), // finished but no turn sample
    })

    const res = await GET()
    const json = await res.json()
    expect(json.health).toMatchObject({
      bga: { tracked: 2, finishedWithSample: 1 },
      rally: { tracked: 1, finishedWithSample: 1 },
      eighteenxx: { tracked: 1, finishedWithSample: 0 },
      hansa: null,
    })
  })

  it('includes self-timed platforms (OBG etc.) in activeEtas and health', async () => {
    mockGetTables.mockResolvedValue({})
    mockListTrackedFirstSeenGameEtas.mockImplementation(async (platform: string) =>
      platform === 'obg' ? [{ id: 'obg:1', game: 'Indonesia', percent: 60, sampleCount: 4, timeBased: true, etaSeconds: 5000 }] : [])
    mockGetTracked.mockImplementation(async (platform: string) =>
      platform === 'obg' ? { 'obg:1': { typeId: 'Indonesia', firstSeenAt: NOW - 1000 } } : {})
    mockGetSamples.mockImplementation(async (platform: string) =>
      platform === 'obg' ? { Indonesia: [8000, 9000] } : {})

    const res = await GET()
    const json = await res.json()
    const byId = Object.fromEntries(json.activeEtas.map((g: any) => [g.id, g]))
    expect(byId['obg:1']).toMatchObject({ platform: 'obg', game: 'Indonesia', selfTimed: true, etaSeconds: 5000 })
    expect(json.health.obg).toEqual({ tracked: 1 + 2, finishedWithSample: 2 })
    expect(json.health.yucata).toEqual({ tracked: 0, finishedWithSample: 0 })
  })

  it('still responds when the rally/18xx stores fail to load', async () => {
    mockGetTables.mockResolvedValue({})
    mockGetRallyGames.mockRejectedValue(new Error('kv down'))
    mockGetEighteenxxPaceGames.mockRejectedValue(new Error('kv down'))

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.health.rally).toMatchObject({ tracked: 0 })
  })
})
