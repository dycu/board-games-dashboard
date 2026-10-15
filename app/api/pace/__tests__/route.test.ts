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

import { getMeta, getTables, getAllTurns } from '@/lib/pace/store'
import { getLoadSamples } from '@/lib/pace/loadSamples'
import { getRallyGames } from '@/lib/rallyPace/store'
import { getEighteenxxPaceGames } from '@/lib/eighteenxxPace/store'
import { GET } from '../route'
import { PaceTable } from '@/lib/pace/store'
import { INITIAL_TURN_STATE } from '@/lib/pace/bgaTurns'

const mockGetMeta = getMeta as jest.Mock
const mockGetTables = getTables as jest.Mock
const mockGetAllTurns = getAllTurns as jest.Mock
const mockGetLoadSamples = getLoadSamples as jest.Mock
const mockGetRallyGames = getRallyGames as jest.Mock
const mockGetEighteenxxPaceGames = getEighteenxxPaceGames as jest.Mock

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
  })

  it('reports an active game with an estimate in activeEtas, soonest first', async () => {
    mockGetTables.mockResolvedValue({
      active: table('active', 'thecrew', null, 5),
      f1: table('f1', 'thecrew', 1000, 30),
    })

    const res = await GET()
    const json = await res.json()
    expect(json.activeEtas).toHaveLength(1)
    expect(json.activeEtas[0]).toMatchObject({ id: 'active', game: 'thecrew' })
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
