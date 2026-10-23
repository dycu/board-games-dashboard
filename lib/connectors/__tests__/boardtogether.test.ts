jest.mock('@vercel/kv', () => ({ kv: { get: jest.fn(), set: jest.fn(), del: jest.fn() } }))

import { kv } from '@vercel/kv'
import { fetchBoardtogether, fetchFinishedBoardtogether } from '../boardtogether'

const mockFetch = jest.fn()
global.fetch = mockFetch
const store = new Map<string, unknown>()

const MY_ID = 'EdWngyj2T8cEjlj1oZO-R'
const session = { cookie: '__session=abc123', userId: MY_ID }

beforeEach(() => {
  mockFetch.mockReset()
  store.clear()
  ;(kv.get as jest.Mock).mockImplementation(async (k: string) => store.get(k) ?? null)
  ;(kv.set as jest.Mock).mockImplementation(async (k: string, v: unknown) => { store.set(k, v); return 'OK' })
  ;(kv.del as jest.Mock).mockImplementation(async (k: string) => { store.delete(k); return 1 })
})

const CATALOG = {
  payload: [
    { id: 'indonesia', metadata: { name: 'Indonesia' } },
    { id: 'the-old-prince', metadata: { name: 'The Old Prince 1871' } },
  ],
}

function mockActiveGame(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '9p7qhXbCS6dlGOKZ736gp',
    typeId: 'indonesia',
    name: 'Testing game on the service',
    status: 'started',
    players: [
      { id: 'XAa6vEcA6eWVjubXxdFdV', userId: MY_ID, isHuman: true, name: 'Dycu', status: 'joined' },
      { id: 'aDDhZBvJyRXti8-CMtMWL', userId: 'other-1', isHuman: true, name: 'Parmezanas', status: 'joined' },
      { id: 'tm_EKKSzvlSVObkaRBDHs', userId: 'other-2', isHuman: true, name: 'NickCartel', status: 'joined' },
    ],
    activePlayerIds: ['tm_EKKSzvlSVObkaRBDHs'],
    lastActionPlayerId: 'XAa6vEcA6eWVjubXxdFdV',
    lastActionAt: '2026-10-23T06:48:47.786Z',
    updatedAt: '2026-10-23T06:48:47.786Z',
    createdAt: '2026-10-22T07:05:22.744Z',
    ...overrides,
  }
}

describe('fetchBoardtogether', () => {
  it('logs in with username/password, resolves my user id, and fetches my games', async () => {
    mockFetch
      // login
      .mockResolvedValueOnce({ ok: true, headers: { get: (h: string) => h === 'set-cookie' ? '__session=abc123; Path=/; HttpOnly' : null }, json: async () => ({ payload: { user: { id: MY_ID } } }) })
      // games/mine
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [mockActiveGame()] } }) })
      // catalog
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const games = await fetchBoardtogether('Dycu', 'pw')

    expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://boardtogether.games/api/v1/auth/login', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ username: 'Dycu', password: 'pw' }),
    }))
    expect(games).toEqual([{
      id: 'boardtogether:9p7qhXbCS6dlGOKZ736gp',
      platform: 'boardtogether',
      gameName: 'Testing game on the service',
      gameType: 'Indonesia',
      myTurn: false,
      currentPlayer: 'NickCartel',
      lastMoveAt: new Date('2026-10-23T06:48:47.786Z'),
      lastMoveAgo: expect.any(String),
      urgent: false,
      gameUrl: 'https://boardtogether.games/game/9p7qhXbCS6dlGOKZ736gp',
      platformUrl: 'https://boardtogether.games/',
      players: ['Parmezanas', 'NickCartel'],
    }])
  })

  it('reports myTurn when I am among the active players', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ activePlayerIds: ['XAa6vEcA6eWVjubXxdFdV'] })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const [result] = await fetchBoardtogether('Dycu', 'pw')
    expect(result.myTurn).toBe(true)
    expect(result.currentPlayer).toBeUndefined()
  })

  it('joins multiple simultaneous active players by name', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ activePlayerIds: ['aDDhZBvJyRXti8-CMtMWL', 'tm_EKKSzvlSVObkaRBDHs'] })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const [result] = await fetchBoardtogether('Dycu', 'pw')
    expect(result.currentPlayer).toBe('Parmezanas, NickCartel')
  })

  it('skips games that have not started yet', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ status: 'open' })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    expect(await fetchBoardtogether('Dycu', 'pw')).toEqual([])
  })

  it('falls back to a humanized type id when the catalog lookup fails', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ typeId: 'the-old-prince' })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockRejectedValueOnce(new Error('catalog unavailable'))

    const [result] = await fetchBoardtogether('Dycu', 'pw')
    // The real catalog name is "The Old Prince 1871" — the humanized
    // fallback is close but not exact, showing why the catalog matters
    expect(result.gameType).toBe('The Old Prince')
  })

  it('reuses a cached session without logging in again', async () => {
    store.set('boardtogether-session', session)
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [mockActiveGame()] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    await fetchBoardtogether('Dycu', 'pw')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenCalledWith('https://boardtogether.games/api/v1/games/mine', { headers: { Cookie: session.cookie } })
  })

  it('drops a rejected cached session and logs in again', async () => {
    store.set('boardtogether-session', { cookie: '__session=stale', userId: MY_ID })
    mockFetch
      // the stale session's games/mine + catalog (fired in parallel; only
      // the first needs to fail to make the whole attempt fail)
      .mockRejectedValueOnce(new Error('unauthorized'))
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })
      // fresh login
      .mockResolvedValueOnce({ ok: true, headers: { get: (h: string) => h === 'set-cookie' ? '__session=fresh; Path=/' : null }, json: async () => ({ payload: { user: { id: MY_ID } } }) })
      // games/mine + catalog again, with the fresh session
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [mockActiveGame()] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const games = await fetchBoardtogether('Dycu', 'pw')
    expect(games).toHaveLength(1)
    expect(store.get('boardtogether-session')).toMatchObject({ cookie: '__session=fresh' })
  })

  it('throws when login does not come back with a session cookie', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, headers: { get: () => null }, json: async () => ({ payload: { user: { id: MY_ID } } }) })
    await expect(fetchBoardtogether('Dycu', 'wrong')).rejects.toThrow('login failed')
  })
})

describe('fetchFinishedBoardtogether', () => {
  it('maps winningPlayerIds to a result', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ status: 'ended', winningPlayerIds: ['XAa6vEcA6eWVjubXxdFdV'] })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const [result] = await fetchFinishedBoardtogether('Dycu', 'pw')
    expect(result).toMatchObject({
      id: 'boardtogether:9p7qhXbCS6dlGOKZ736gp',
      gameName: 'Testing game on the service',
      gameType: 'Indonesia',
      result: 'won',
      playerCount: 3,
      opponents: [{ name: 'Parmezanas' }, { name: 'NickCartel' }],
    })
  })

  it('reports a draw when tied for the win', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ winningPlayerIds: ['XAa6vEcA6eWVjubXxdFdV', 'aDDhZBvJyRXti8-CMtMWL'] })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const [result] = await fetchFinishedBoardtogether('Dycu', 'pw')
    expect(result.result).toBe('draw')
  })

  it('reports a loss when I am not among the winners', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ winningPlayerIds: ['aDDhZBvJyRXti8-CMtMWL'] })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const [result] = await fetchFinishedBoardtogether('Dycu', 'pw')
    expect(result.result).toBe('lost')
  })
})
