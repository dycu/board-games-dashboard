import { fetchYucata } from '@/lib/connectors/yucata'

const mockFetch = jest.fn()
global.fetch = mockFetch

// Fixture matches the real /api/user/me/games/current response structure
const FIXTURE = {
  games: [
    {
      id: 101,
      gameIDName: 'brassbirmingham',
      gameName: 'Brass: Birmingham (Standard rules)',
      gameShortName: 'Brass: Birmingham',
      gameType: 99,
      userIsOnTurn: true,
      playerOnTurn: 42,
      lastMoveBy: 43,
      lastMoveOn: '2024-06-20T10:00:00.000Z',
      numPlayers: 3,
      players: [
        { playerID: 42, login: 'testuser', since: null, isOnVacation: false },
        { playerID: 43, login: 'alice', since: null, isOnVacation: false },
        { playerID: 44, login: 'bob', since: null, isOnVacation: false },
      ],
    },
    {
      id: 202,
      gameIDName: 'hive',
      gameName: 'Hive',
      gameShortName: 'Hive',
      gameType: 12,
      userIsOnTurn: false,
      playerOnTurn: 43,
      lastMoveBy: 42,
      lastMoveOn: '2024-06-24T10:00:00.000Z',
      numPlayers: 2,
      players: [
        { playerID: 42, login: 'testuser', since: null, isOnVacation: false },
        { playerID: 43, login: 'alice', since: null, isOnVacation: false },
      ],
    },
  ],
}

function setupHappyPath() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'ASP.NET_SessionId=abc; Path=/' },
    })
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'YucataAuth=xyz; Path=/' },
      json: async () => ({ success: true }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => FIXTURE,
    })
}

describe('fetchYucata', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns Game[] from API response', async () => {
    setupHappyPath()
    const games = await fetchYucata('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      platform: 'yucata',
      id: expect.stringMatching(/^yucata:/),
      myTurn: expect.any(Boolean),
      gameUrl: expect.stringContaining('yucata.de'),
    })
  })

  it('uses GameShortName as gameName', async () => {
    setupHappyPath()
    const games = await fetchYucata('testuser', 'pass')
    expect(games[0].gameName).toBe('Brass: Birmingham')
    expect(games[1].gameName).toBe('Hive')
  })

  it('builds the game URL from the game id', async () => {
    setupHappyPath()
    const games = await fetchYucata('testuser', 'pass')
    expect(games[0].gameUrl).toBe('https://www.yucata.de/en/game/101')
  })

  it('correctly identifies whose turn it is using userIsOnTurn', async () => {
    setupHappyPath()
    const games = await fetchYucata('testuser', 'pass')
    const g1 = games.find(g => g.id === 'yucata:101')!
    expect(g1.myTurn).toBe(true)
    const g2 = games.find(g => g.id === 'yucata:202')!
    expect(g2.myTurn).toBe(false)
    expect(g2.currentPlayer).toBe('alice')
  })

  it('excludes the logged-in user from other players list', async () => {
    setupHappyPath()
    const games = await fetchYucata('testuser', 'pass')
    const g1 = games[0]
    expect(g1.players).toEqual(expect.arrayContaining(['alice', 'bob']))
    expect(g1.players).not.toContain('testuser')
  })

  it('throws when login returns success:false', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'ASP.NET_SessionId=abc; Path=/' },
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        json: async () => ({ success: false }),
      })
    await expect(fetchYucata('bad', 'creds')).rejects.toThrow('Yucata login failed')
  })
})
