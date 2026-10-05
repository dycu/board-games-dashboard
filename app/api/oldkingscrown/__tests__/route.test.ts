/**
 * @jest-environment node
 */
import { EventEmitter } from 'events'

jest.mock('ws', () => {
  const mockBehavior: Record<string, { snapshot?: any; error?: string; closeOnly?: boolean }> = {}

  class MockWebSocket extends EventEmitter {
    url: string
    constructor(url: string) {
      super()
      this.url = url
      queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({ kind: 'seats', seats: [] }))))
    }
    send(raw: string) {
      const msg = JSON.parse(raw)
      if (msg.kind !== 'spectator.join') return
      const gameId = this.url.match(/\/api\/games\/([^/?]+)/)?.[1] ?? ''
      const behavior = mockBehavior[gameId]
      if (behavior?.snapshot) {
        queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify(behavior.snapshot))))
      } else if (behavior?.error) {
        queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({ kind: 'error', message: behavior.error }))))
      } else if (behavior?.closeOnly) {
        queueMicrotask(() => this.emit('close'))
      }
    }
    close() {}
    terminate() {}
  }

  return { __esModule: true, default: MockWebSocket, __mockBehavior: mockBehavior }
})
jest.mock('@/lib/prefs')

import { getPrefs } from '@/lib/prefs'
import { GET, fetchOkcSnapshot, isMyTurn, type OkcSnapshot } from '../route'
import { DEFAULT_PREFS } from '@/lib/types'

const mockGetPrefs = getPrefs as jest.MockedFunction<typeof getPrefs>
const mockBehavior = (jest.requireMock('ws') as any).__mockBehavior as Record<string, { snapshot?: any; error?: string; closeOnly?: boolean }>

function makeSnapshot(overrides: Partial<OkcSnapshot['state']> & { seats?: OkcSnapshot['seats'] } = {}): OkcSnapshot {
  return {
    kind: 'snapshot',
    seats: overrides.seats ?? [
      { id: 'p0', occupants: [{ nickname: 'Dycu' }] },
      { id: 'p1', occupants: [{ nickname: 'Anae' }] },
      { id: 'p2', occupants: [{ nickname: 'Brotherman' }] },
    ],
    state: {
      turnQueue: overrides.turnQueue ?? [],
      phase: overrides.phase ?? { kind: 'spring', step: 'place-bids' },
      round: overrides.round ?? { current: 1, total: 5 },
      regionCardsCommittedBy: overrides.regionCardsCommittedBy ?? [],
      table: { players: overrides.table?.players ?? [
        { id: 'p0', bid: null },
        { id: 'p1', bid: null },
        { id: 'p2', bid: null },
      ] },
    },
  }
}

describe('fetchOkcSnapshot / isMyTurn', () => {
  beforeEach(() => { for (const k of Object.keys(mockBehavior)) delete mockBehavior[k] })

  it('resolves with the snapshot after completing the seats -> spectator.join -> snapshot handshake', async () => {
    const snapshot = makeSnapshot()
    mockBehavior['game-1'] = { snapshot }
    const result = await fetchOkcSnapshot('game-1')
    expect(result).toEqual(snapshot)
  })

  it('rejects when the server sends an error message', async () => {
    mockBehavior['game-1'] = { error: 'game is full' }
    await expect(fetchOkcSnapshot('game-1')).rejects.toThrow('game is full')
  })

  it('rejects when the connection closes before a snapshot arrives', async () => {
    mockBehavior['game-1'] = { closeOnly: true }
    await expect(fetchOkcSnapshot('game-1')).rejects.toThrow('closed the connection')
  })

  it('is my turn when I am at the front of a non-empty turnQueue', () => {
    const snapshot = makeSnapshot({ turnQueue: ['p0'] })
    expect(isMyTurn(snapshot, 'p0')).toBe(true)
    expect(isMyTurn(snapshot, 'p1')).toBe(false)
  })

  it('is not my turn when someone else is at the front of the turnQueue', () => {
    const snapshot = makeSnapshot({ turnQueue: ['p1', 'p0'] })
    expect(isMyTurn(snapshot, 'p0')).toBe(false)
  })

  it('is my turn during the bidding phase when I have not bid yet', () => {
    const snapshot = makeSnapshot({
      phase: { kind: 'spring', step: 'place-bids' },
      table: { players: [{ id: 'p0', bid: null }, { id: 'p1', bid: 'CARD-1' }, { id: 'p2', bid: 'CARD-2' }] },
    })
    expect(isMyTurn(snapshot, 'p0')).toBe(true)
  })

  it('is not my turn during the bidding phase once I have already bid', () => {
    const snapshot = makeSnapshot({
      phase: { kind: 'spring', step: 'place-bids' },
      table: { players: [{ id: 'p0', bid: 'CARD-1' }, { id: 'p1', bid: null }, { id: 'p2', bid: 'CARD-2' }] },
    })
    expect(isMyTurn(snapshot, 'p0')).toBe(false)
  })

  it('defaults to not my turn for an unrecognized simultaneous phase with an empty turnQueue', () => {
    const snapshot = makeSnapshot({ phase: { kind: 'summer', step: 'some-other-step' } })
    expect(isMyTurn(snapshot, 'p0')).toBe(false)
  })

  it('is my turn during region-card placement when I have not committed yet', () => {
    const snapshot = makeSnapshot({
      phase: { kind: 'spring', step: 'place-region-cards' },
      regionCardsCommittedBy: ['p1', 'p2'],
    })
    expect(isMyTurn(snapshot, 'p0')).toBe(true)
  })

  it('is not my turn during region-card placement once I have already committed', () => {
    const snapshot = makeSnapshot({
      phase: { kind: 'spring', step: 'place-region-cards' },
      regionCardsCommittedBy: ['p0', 'p1'],
    })
    expect(isMyTurn(snapshot, 'p0')).toBe(false)
  })
})

describe('GET /api/oldkingscrown', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockBehavior)) delete mockBehavior[k]
    mockGetPrefs.mockReset()
  })

  it('returns an empty list without connecting anywhere when no game ids are configured', async () => {
    mockGetPrefs.mockResolvedValue({ ...DEFAULT_PREFS, oldkingscrownGameIds: [] })
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual({ games: [], error: null, configured: [] })
  })

  it('returns a game with myTurn/currentPlayer derived from the snapshot', async () => {
    mockGetPrefs.mockResolvedValue({ ...DEFAULT_PREFS, oldkingscrownGameIds: ['game-1'] })
    mockBehavior['game-1'] = {
      snapshot: makeSnapshot({
        phase: { kind: 'spring', step: 'place-bids' },
        table: { players: [{ id: 'p0', bid: 'CARD-1' }, { id: 'p1', bid: null }, { id: 'p2', bid: 'CARD-2' }] },
      }),
    }

    const res = await GET()
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.games).toHaveLength(1)
    expect(json.games[0]).toMatchObject({
      id: 'oldkingscrown:game-1',
      platform: 'oldkingscrown',
      gameName: "The Old King's Crown",
      myTurn: false,
      currentPlayer: 'Anae',
      gameUrl: 'https://oldkingscrown.fly.dev/game/game-1',
      players: expect.arrayContaining(['Anae', 'Brotherman']),
    })
  })

  it('returns myTurn:true with no currentPlayer when I still need to place region cards', async () => {
    mockGetPrefs.mockResolvedValue({ ...DEFAULT_PREFS, oldkingscrownGameIds: ['game-1'] })
    mockBehavior['game-1'] = {
      snapshot: makeSnapshot({
        phase: { kind: 'spring', step: 'place-region-cards' },
        regionCardsCommittedBy: ['p1', 'p2'],
      }),
    }

    const res = await GET()
    const json = await res.json()
    expect(json.games).toHaveLength(1)
    expect(json.games[0].myTurn).toBe(true)
    expect(json.games[0].currentPlayer).toBeUndefined()
  })

  it('skips a game where the configured nickname is not seated, without erroring', async () => {
    mockGetPrefs.mockResolvedValue({ ...DEFAULT_PREFS, oldkingscrownGameIds: ['game-1'] })
    mockBehavior['game-1'] = {
      snapshot: makeSnapshot({ seats: [{ id: 'p0', occupants: [{ nickname: 'SomeoneElse' }] }] }),
    }

    const res = await GET()
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.games).toEqual([])
    expect(json.configured).toEqual([
      { gameId: 'game-1', status: 'not-member', players: ['SomeoneElse'] },
    ])
  })

  it('drops a finished game from the active list and reports it as finished', async () => {
    mockGetPrefs.mockResolvedValue({ ...DEFAULT_PREFS, oldkingscrownGameIds: ['game-1'] })
    mockBehavior['game-1'] = {
      snapshot: makeSnapshot({ phase: { kind: 'game-over', step: '' } }),
    }

    const res = await GET()
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.games).toEqual([])
    expect(json.configured).toEqual([
      { gameId: 'game-1', status: 'finished', players: expect.arrayContaining(['Dycu', 'Anae', 'Brotherman']) },
    ])
  })

  it('reports the players and status for every configured game, including the active one', async () => {
    mockGetPrefs.mockResolvedValue({ ...DEFAULT_PREFS, oldkingscrownGameIds: ['game-1'] })
    mockBehavior['game-1'] = { snapshot: makeSnapshot({ turnQueue: ['p0'] }) }

    const res = await GET()
    const json = await res.json()
    expect(json.configured).toHaveLength(1)
    expect(json.configured[0]).toMatchObject({
      gameId: 'game-1',
      status: 'active',
      players: expect.arrayContaining(['Dycu', 'Anae', 'Brotherman']),
      game: expect.objectContaining({ id: 'oldkingscrown:game-1' }),
    })
  })

  it('reports a failed game id with its error message in configured', async () => {
    mockGetPrefs.mockResolvedValue({ ...DEFAULT_PREFS, oldkingscrownGameIds: ['bad-game'] })
    mockBehavior['bad-game'] = { error: 'game not found' }

    const res = await GET()
    const json = await res.json()
    expect(json.configured).toEqual([
      { gameId: 'bad-game', status: 'error', players: [], error: expect.stringContaining('game not found') },
    ])
  })

  it('does not let one failed game id take down the others', async () => {
    mockGetPrefs.mockResolvedValue({ ...DEFAULT_PREFS, oldkingscrownGameIds: ['good-game', 'bad-game'] })
    mockBehavior['good-game'] = { snapshot: makeSnapshot({ turnQueue: ['p0'] }) }
    mockBehavior['bad-game'] = { error: 'game not found' }

    const res = await GET()
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.games).toHaveLength(1)
    expect(json.games[0].id).toBe('oldkingscrown:good-game')
  })

  it('surfaces an error only when every configured game fails', async () => {
    mockGetPrefs.mockResolvedValue({ ...DEFAULT_PREFS, oldkingscrownGameIds: ['bad-game'] })
    mockBehavior['bad-game'] = { error: 'game not found' }

    const res = await GET()
    const json = await res.json()
    expect(json.games).toEqual([])
    expect(json.error).toContain('game not found')
  })
})
