import { EventEmitter } from 'events'

jest.mock('@vercel/kv', () => ({ kv: { hgetall: jest.fn(), hset: jest.fn() } }))
jest.mock('../../connectors/rally', () => ({
  HEADERS: { 'User-Agent': 'test-agent' },
  fetchRallyWithSession: jest.fn(),
  fetchFinishedRallyWithCookie: jest.fn(),
}))
jest.mock('ws', () => {
  const mockBehavior: Record<string, { turn?: number; error?: string; silent?: boolean }> = {}
  const constructedIds: string[] = []

  class MockWebSocket extends EventEmitter {
    constructor(url: string) {
      super()
      const id = new URL(url).searchParams.get('game') ?? ''
      constructedIds.push(id)
      const behavior = mockBehavior[id]
      if (behavior?.silent) return // never responds — exercises the timeout path
      queueMicrotask(() => {
        if (behavior?.error) this.emit('message', Buffer.from(JSON.stringify(['error', behavior.error])))
        else if (typeof behavior?.turn === 'number') this.emit('message', Buffer.from(JSON.stringify(['state', { turn: behavior.turn }])))
      })
    }
    close() {}
  }

  return { __esModule: true, default: MockWebSocket, __mockBehavior: mockBehavior, __constructedIds: constructedIds }
})

import { kv } from '@vercel/kv'
import { fetchRallyWithSession, fetchFinishedRallyWithCookie } from '../../connectors/rally'
import { syncRally } from '../sync'
import { Game, FinishedGame } from '../../types'

const mockHgetall = kv.hgetall as jest.Mock
const mockHset = kv.hset as jest.Mock
const mockFetchActive = fetchRallyWithSession as jest.Mock
const mockFetchFinished = fetchFinishedRallyWithCookie as jest.Mock
const wsMock = jest.requireMock('ws') as any
const mockBehavior = wsMock.__mockBehavior as Record<string, { turn?: number; error?: string; silent?: boolean }>
const constructedIds = wsMock.__constructedIds as string[]

const activeGame = (id: string, title: string, others: string[] = ['carol']): Game => ({
  id: `rally:${id}`, platform: 'rally', gameName: title, myTurn: true,
  lastMoveAt: new Date(), lastMoveAgo: '1h ago', urgent: false,
  gameUrl: `https://rally-the-troops.com/${title}/play.html?game=${id}&role=Union`,
  platformUrl: 'https://rally-the-troops.com/games/active', players: others,
})

const finishedGame = (id: string, title: string, playerCount?: number): FinishedGame => ({
  id: `rally:${id}`, platform: 'rally', gameName: title,
  completedAt: new Date('2026-01-01T00:00:00Z'),
  completedAgo: '1 day ago',
  gameUrl: `https://rally-the-troops.com/${title}/play.html?game=${id}&role=Union`,
  ...(playerCount !== undefined && { playerCount }),
})

describe('syncRally backfill', () => {
  beforeEach(() => {
    mockHgetall.mockReset().mockResolvedValue({})
    mockHset.mockReset()
    mockFetchActive.mockReset().mockResolvedValue({ cookie: 'login=abc', games: [] })
    mockFetchFinished.mockReset().mockResolvedValue([])
    Object.keys(mockBehavior).forEach(k => delete mockBehavior[k])
    constructedIds.length = 0
  })

  it('reads a finished game\'s turn via its live-state socket and stores it, keyed by id', async () => {
    mockFetchFinished.mockResolvedValue([finishedGame('501', 'maria', 3)])
    mockBehavior['501'] = { turn: 14 }

    const result = await syncRally('me', 'pass', 15000)
    expect(result.backfilled).toBe(1)
    expect(mockHset).toHaveBeenCalledWith('rallypace:v1:games', expect.objectContaining({
      '501': { id: '501', game: 'maria', end: Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000), turn: 14, playerCount: 3, lastCheckedAt: expect.any(Number) },
    }))
  })

  it('never re-reads a finished game that already has a recorded turn', async () => {
    mockHgetall.mockResolvedValue({ '501': { id: '501', game: 'maria', end: 1700000000, turn: 14 } })
    mockFetchFinished.mockResolvedValue([finishedGame('501', 'maria')])

    const result = await syncRally('me', 'pass', 15000)
    expect(result.backfilled).toBe(0)
    expect(constructedIds).not.toContain('501')
  })

  it('does not fail the whole sync when fetching the finished-games list fails', async () => {
    mockFetchActive.mockResolvedValue({ cookie: 'login=abc', games: [activeGame('1', 'maria')] })
    mockBehavior['1'] = { turn: 5 }
    mockFetchFinished.mockRejectedValue(new Error('network error'))

    const result = await syncRally('me', 'pass', 15000)
    expect(result).toMatchObject({ games: 1, read: 1, backfilled: 0 })
  })

  it('records lastError without discarding a previously-read turn when the backfill read fails', async () => {
    mockHgetall.mockResolvedValue({ '501': { id: '501', game: 'maria', end: null, turn: 14 } })
    mockFetchFinished.mockResolvedValue([finishedGame('501', 'maria')])
    mockBehavior['501'] = { error: 'nope' }

    await syncRally('me', 'pass', 15000)
    expect(mockHset).toHaveBeenCalledWith('rallypace:v1:games', expect.objectContaining({
      '501': expect.objectContaining({ turn: 14, lastError: 'server said: nope' }),
    }))
  })
})
