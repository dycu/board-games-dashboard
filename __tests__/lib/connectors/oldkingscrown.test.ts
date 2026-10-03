import { fetchOldKingsCrown } from '@/lib/connectors/oldkingscrown'

const mockFetch = jest.fn()
global.fetch = mockFetch

const LOBBIES_SUMMARY = {
  lobbies: [
    { id: 'lobby-full-not-ready', name: 'Full, waiting on me', status: 'waiting', seats: 2, memberCount: 2, updatedAt: '2026-10-01T10:00:00.000Z' },
    { id: 'lobby-not-full', name: 'Still filling up', status: 'waiting', seats: 3, memberCount: 1, updatedAt: '2026-10-02T10:00:00.000Z' },
    { id: 'lobby-full-others-not-ready', name: 'Full, waiting on others', status: 'waiting', seats: 2, memberCount: 2, updatedAt: '2026-10-03T10:00:00.000Z' },
    { id: 'lobby-not-mine', name: 'Someone else entirely', status: 'waiting', seats: 2, memberCount: 2, updatedAt: '2026-10-04T10:00:00.000Z' },
    { id: 'lobby-started', name: 'Already started', status: 'started', seats: 2, memberCount: 2, updatedAt: '2026-10-05T10:00:00.000Z' },
  ],
}

const LOBBY_DETAILS: Record<string, any> = {
  'lobby-full-not-ready': {
    lobby: {
      id: 'lobby-full-not-ready', name: 'Full, waiting on me', status: 'waiting', seats: 2, memberCount: 2,
      updatedAt: '2026-10-01T10:00:00.000Z',
      members: [
        { nickname: 'Dycu', seat: 0, ready: false, isHost: true },
        { nickname: 'alice', seat: 1, ready: true, isHost: false },
      ],
    },
  },
  'lobby-not-full': {
    lobby: {
      id: 'lobby-not-full', name: 'Still filling up', status: 'waiting', seats: 3, memberCount: 1,
      updatedAt: '2026-10-02T10:00:00.000Z',
      members: [
        { nickname: 'dycu', seat: 0, ready: true, isHost: true },
      ],
    },
  },
  'lobby-full-others-not-ready': {
    lobby: {
      id: 'lobby-full-others-not-ready', name: 'Full, waiting on others', status: 'waiting', seats: 2, memberCount: 2,
      updatedAt: '2026-10-03T10:00:00.000Z',
      members: [
        { nickname: 'bob', seat: 0, ready: false, isHost: true },
        { nickname: 'Dycu', seat: 1, ready: true, isHost: false },
      ],
    },
  },
  'lobby-not-mine': {
    lobby: {
      id: 'lobby-not-mine', name: 'Someone else entirely', status: 'waiting', seats: 2, memberCount: 2,
      updatedAt: '2026-10-04T10:00:00.000Z',
      members: [
        { nickname: 'carol', seat: 0, ready: true, isHost: true },
        { nickname: 'dave', seat: 1, ready: false, isHost: false },
      ],
    },
  },
}

function setupHappyPath() {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => LOBBIES_SUMMARY })
  for (const id of ['lobby-full-not-ready', 'lobby-not-full', 'lobby-full-others-not-ready', 'lobby-not-mine']) {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => LOBBY_DETAILS[id] })
  }
}

describe('fetchOldKingsCrown', () => {
  beforeEach(() => mockFetch.mockClear())

  it('only fetches lobby details for waiting lobbies, skipping already-started ones', async () => {
    setupHappyPath()
    await fetchOldKingsCrown('Dycu')
    expect(mockFetch).toHaveBeenCalledTimes(5) // 1 list + 4 waiting lobbies (not the started one)
    expect(mockFetch.mock.calls[0][0]).toBe('https://oldkingscrown.fly.dev/api/lobbies')
  })

  it('only returns lobbies where the nickname is a member, matched case-insensitively', async () => {
    setupHappyPath()
    const games = await fetchOldKingsCrown('Dycu')
    expect(games).toHaveLength(3)
    expect(games.map(g => g.id)).toEqual(expect.arrayContaining([
      'oldkingscrown:lobby-full-not-ready',
      'oldkingscrown:lobby-not-full',
      'oldkingscrown:lobby-full-others-not-ready',
    ]))
    expect(games.find(g => g.id === 'oldkingscrown:lobby-not-mine')).toBeUndefined()
  })

  it('is my turn when the lobby is full and I have not readied up', async () => {
    setupHappyPath()
    const games = await fetchOldKingsCrown('Dycu')
    const g = games.find(g => g.id === 'oldkingscrown:lobby-full-not-ready')!
    expect(g.myTurn).toBe(true)
    expect(g.currentPlayer).toBeUndefined()
    expect(g.players).toEqual(['alice'])
  })

  it('shows how many more players are needed when the lobby is not full', async () => {
    setupHappyPath()
    const games = await fetchOldKingsCrown('Dycu')
    const g = games.find(g => g.id === 'oldkingscrown:lobby-not-full')!
    expect(g.myTurn).toBe(false)
    expect(g.currentPlayer).toBe('2 more players')
  })

  it('names the other members still not ready when the lobby is full and I already am', async () => {
    setupHappyPath()
    const games = await fetchOldKingsCrown('Dycu')
    const g = games.find(g => g.id === 'oldkingscrown:lobby-full-others-not-ready')!
    expect(g.myTurn).toBe(false)
    expect(g.currentPlayer).toBe('bob')
  })

  it('sets gameUrl to the lobby page and platformUrl to the site root', async () => {
    setupHappyPath()
    const games = await fetchOldKingsCrown('Dycu')
    const g = games.find(g => g.id === 'oldkingscrown:lobby-full-not-ready')!
    expect(g.gameUrl).toBe('https://oldkingscrown.fly.dev/lobby/lobby-full-not-ready')
    expect(g.platformUrl).toBe('https://oldkingscrown.fly.dev')
  })

  it('throws when the lobbies list fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(fetchOldKingsCrown('Dycu')).rejects.toThrow('HTTP 500')
  })
})
