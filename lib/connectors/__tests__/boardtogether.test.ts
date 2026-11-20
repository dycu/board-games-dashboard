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

  it('skips games with an unrecognized status entirely — neither started nor waiting to start', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ status: 'open' })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    expect(await fetchBoardtogether('Dycu', 'pw')).toEqual([])
  })

  it('includes a table still waiting for more players to join, tagged pending', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ status: 'waitingForPlayers', activePlayerIds: [] })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const [result] = await fetchBoardtogether('Dycu', 'pw')
    expect(result).toMatchObject({ id: 'boardtogether:9p7qhXbCS6dlGOKZ736gp', pending: true, myTurn: false })
  })

  it('counts only players who actually joined, not empty/reserved seats also present in the list', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({
      status: 'waitingForPlayers',
      activePlayerIds: [],
      players: [
        { id: 'XAa6vEcA6eWVjubXxdFdV', userId: MY_ID, isHuman: true, name: 'Dycu', status: 'joined' },
        { id: 'open-seat-1', isHuman: true, name: '', status: 'open' },
        { id: 'open-seat-2', isHuman: true, name: '', status: 'open' },
        { id: 'reserved-seat', isHuman: true, name: 'SavedForAFriend', status: 'reserved' },
      ],
    })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const [result] = await fetchBoardtogether('Dycu', 'pw')
    // 1 joined out of 4 total seats (open/reserved placeholders included) —
    // genuinely still short, not "waiting to start"
    expect(result.currentPlayer).toBe('1/4 joined — waiting for players')
    expect(result.players).toEqual([])
  })

  it('includes a full table waiting on the host to start it, also tagged pending', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ status: 'waitingToStart', activePlayerIds: [] })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const [result] = await fetchBoardtogether('Dycu', 'pw')
    expect(result).toMatchObject({ id: 'boardtogether:9p7qhXbCS6dlGOKZ736gp', pending: true, myTurn: false })
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

  it('leads with the real game type, appending the player-set table title', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ name: '1830 is here!', typeId: 'indonesia' })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const [result] = await fetchBoardtogether('Dycu', 'pw')
    expect(result.gameName).toBe('Indonesia — 1830 is here!')
  })

  it('does not repeat the game type when the table has no distinct title', async () => {
    store.set('boardtogether-session', session)
    const game = mockActiveGame({ name: '' })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payload: { games: [game] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => CATALOG })

    const [result] = await fetchBoardtogether('Dycu', 'pw')
    expect(result.gameName).toBe('Indonesia')
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
      gameName: 'Indonesia — Testing game on the service',
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
