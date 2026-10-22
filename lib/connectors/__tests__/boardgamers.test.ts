jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn(), del: jest.fn() } }))

import { kv } from '@vercel/kv'
import { fetchBoardgamers, fetchFinishedBoardgamers } from '../boardgamers'

const mockFetch = jest.fn()
global.fetch = mockFetch
const store = new Map<string, unknown>()

const MY_ID = '6aaa97a4354e2399e5e3a1f3'
const session = { cookie: 'refreshToken=abc123', userId: MY_ID }

beforeEach(() => {
  mockFetch.mockReset()
  store.clear()
  ;(kv.get as jest.Mock).mockImplementation(async (k: string) => store.get(k) ?? null)
  ;(kv.set as jest.Mock).mockImplementation(async (k: string, v: unknown) => { store.set(k, v); return 'OK' })
  ;(kv.del as jest.Mock).mockImplementation(async (k: string) => { store.delete(k); return 1 })
})

function mockActiveGame(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: 'Cynical-rune-7354',
    players: [
      { _id: 'opponent-id', name: 'Mouthbreather907', dropped: false, quit: false },
      { _id: MY_ID, name: 'Dycu', dropped: false, quit: false },
      { _id: 'third-id', name: 'PlntCrvn', dropped: false, quit: false },
    ],
    currentPlayers: [{ _id: 'opponent-id', deadline: '2026-10-28T00:00:00.000Z' }],
    game: { name: 'gaia-project' },
    status: 'active',
    lastMove: '2026-10-22T10:51:04.756Z',
    ...overrides,
  }
}

describe('fetchBoardgamers', () => {
  it('logs in, resolves the account id, and fetches only this user\'s active games', async () => {
    mockFetch
      // login
      .mockResolvedValueOnce({ ok: true, headers: { get: (h: string) => h === 'set-cookie' ? 'refreshToken=abc123; Path=/; HttpOnly' : null }, text: async () => '{"type":"redirect","status":303,"location":"/login"}' })
      // account
      .mockResolvedValueOnce({ ok: true, json: async () => ({ _id: MY_ID }) })
      // active games
      .mockResolvedValueOnce({ ok: true, json: async () => [mockActiveGame()] })

    const games = await fetchBoardgamers('me@example.com', 'pw')

    expect(mockFetch).toHaveBeenNthCalledWith(3, expect.stringContaining(`/api/game/status/active?user=${MY_ID}`), expect.anything())
    expect(games).toEqual([{
      id: 'boardgamers:Cynical-rune-7354',
      platform: 'boardgamers',
      gameName: 'Gaia Project',
      gameType: 'Gaia Project',
      myTurn: false,
      currentPlayer: 'Mouthbreather907',
      lastMoveAt: new Date('2026-10-22T10:51:04.756Z'),
      lastMoveAgo: expect.any(String),
      urgent: false,
      gameUrl: 'https://boardgamers.space/game/Cynical-rune-7354',
      platformUrl: 'https://boardgamers.space/?tab=mine',
      players: ['Mouthbreather907', 'PlntCrvn'],
    }])
  })

  it('reports myTurn and the deadline from my own currentPlayers entry', async () => {
    store.set('boardgamers-session', session)
    const game = mockActiveGame({ currentPlayers: [{ _id: MY_ID, deadline: '2026-10-28T00:00:00.000Z' }] })
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [game] })

    const [result] = await fetchBoardgamers('me@example.com', 'pw')
    expect(result.myTurn).toBe(true)
    expect(result.currentPlayer).toBeUndefined()
    expect(result.deadlineAt).toBe('2026-10-28T00:00:00.000Z')
  })

  it('joins multiple simultaneous current players by name, excluding me', async () => {
    store.set('boardgamers-session', session)
    const game = mockActiveGame({
      currentPlayers: [{ _id: 'opponent-id', deadline: 'x' }, { _id: 'third-id', deadline: 'y' }],
    })
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [game] })

    const [result] = await fetchBoardgamers('me@example.com', 'pw')
    expect(result.myTurn).toBe(false)
    expect(result.currentPlayer).toBe('Mouthbreather907, PlntCrvn')
  })

  it('reuses a cached session without logging in again', async () => {
    store.set('boardgamers-session', session)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [mockActiveGame()] })

    await fetchBoardgamers('me@example.com', 'pw')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/game/status/active'), expect.objectContaining({ headers: expect.objectContaining({ Cookie: session.cookie }) }))
  })

  it('drops a rejected cached session and logs in again', async () => {
    store.set('boardgamers-session', { cookie: 'refreshToken=stale', userId: MY_ID })
    mockFetch
      .mockRejectedValueOnce(new Error('network down')) // the stale-session games fetch fails
      .mockResolvedValueOnce({ ok: true, headers: { get: (h: string) => h === 'set-cookie' ? 'refreshToken=fresh; Path=/' : null }, text: async () => '{"location":"/"}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ _id: MY_ID }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [mockActiveGame()] })

    const games = await fetchBoardgamers('me@example.com', 'pw')
    expect(games).toHaveLength(1)
    expect(store.get('boardgamers-session')).toMatchObject({ cookie: 'refreshToken=fresh' })
  })

  it('throws when the login response carries an error redirect', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      text: async () => '{"type":"redirect","status":303,"location":"/login?error=wrong+password"}',
    })
    await expect(fetchBoardgamers('me@example.com', 'bad')).rejects.toThrow('wrong password')
  })
})

describe('fetchFinishedBoardgamers', () => {
  it('maps ranking to a result and computes my final elo', async () => {
    store.set('boardgamers-session', session)
    const game = {
      _id: 'Steamy-fairy-2772',
      players: [
        { _id: MY_ID, name: 'Dycu', dropped: false, quit: false, score: 164, ranking: 1, elo: { delta: 6, initial: 334 } },
        { _id: 'opponent-id', name: 'Mouthbreather907', dropped: false, quit: false, score: 143, ranking: 2, elo: { delta: -6, initial: 192 } },
      ],
      currentPlayers: [],
      game: { name: 'gaia-project' },
      status: 'ended',
      lastMove: '2026-10-22T11:28:42.181Z',
      endedAt: '2026-10-22T11:28:42.181Z',
      cancelled: false,
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [game] })

    const [result] = await fetchFinishedBoardgamers('me@example.com', 'pw')
    expect(result).toMatchObject({
      id: 'boardgamers:Steamy-fairy-2772',
      gameName: 'Gaia Project',
      result: 'won',
      rank: 1,
      playerCount: 2,
      elo: 340,
      eloDelta: 6,
      opponents: [{ name: 'Mouthbreather907', rank: 2 }],
    })
  })

  it('reports a draw when tied for first place', async () => {
    store.set('boardgamers-session', session)
    const game = {
      _id: 'tied-game',
      players: [
        { _id: MY_ID, name: 'Dycu', dropped: false, quit: false, ranking: 1 },
        { _id: 'opponent-id', name: 'Opp', dropped: false, quit: false, ranking: 1 },
      ],
      currentPlayers: [],
      game: { name: 'container' },
      status: 'ended',
      lastMove: '2026-10-22T11:28:42.181Z',
      endedAt: '2026-10-22T11:28:42.181Z',
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [game] })

    const [result] = await fetchFinishedBoardgamers('me@example.com', 'pw')
    expect(result.result).toBe('draw')
  })

  it('excludes cancelled games', async () => {
    store.set('boardgamers-session', session)
    const game = {
      _id: 'cancelled-game',
      players: [{ _id: MY_ID, name: 'Dycu', dropped: false, quit: false, ranking: 1 }],
      currentPlayers: [],
      game: { name: 'outpost' },
      status: 'ended',
      lastMove: '2026-10-22T11:28:42.181Z',
      cancelled: true,
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [game] })

    const games = await fetchFinishedBoardgamers('me@example.com', 'pw')
    expect(games).toEqual([])
  })
})
