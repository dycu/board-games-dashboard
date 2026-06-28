import { fetchYucata } from '@/lib/connectors/yucata'

const mockFetch = jest.fn()
global.fetch = mockFetch

// Fixture matches the real CurrentGameRecord:#Yucata.Data response structure
const FIXTURE = {
  d: {
    Games: [
      {
        ID: 101,
        GameIDName: 'brassbirmingham',
        GameName: 'Brass: Birmingham (Standard rules)',
        GameShortName: 'Brass: Birmingham',
        GameType: 99,
        UserIsOnTurn: true,
        PlayerOnTurn: 42,
        LastMoveBy: 43,
        LastMoveOn: '2024-06-20T10:00:00.000Z',
        NumPlayers: 3,
        Players: [
          { PlayerID: 42, Login: 'testuser', Order: 1, Rank: 'Healer', IsOnVacation: false },
          { PlayerID: 43, Login: 'alice', Order: 2, Rank: 'Healer', IsOnVacation: false },
          { PlayerID: 44, Login: 'bob', Order: 3, Rank: 'Lumberjack', IsOnVacation: false },
        ],
      },
      {
        ID: 202,
        GameIDName: 'hive',
        GameName: 'Hive',
        GameShortName: 'Hive',
        GameType: 12,
        UserIsOnTurn: false,
        PlayerOnTurn: 43,
        LastMoveBy: 42,
        LastMoveOn: '2024-06-24T10:00:00.000Z',
        NumPlayers: 2,
        Players: [
          { PlayerID: 42, Login: 'testuser', Order: 1, Rank: 'Healer', IsOnVacation: false },
          { PlayerID: 43, Login: 'alice', Order: 2, Rank: 'Healer', IsOnVacation: false },
        ],
      },
    ],
  },
}

function setupHappyPath() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'ASP.NET_SessionId=abc; Path=/' },
    })
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'Yucata=xyz; Path=/' },
      json: async () => ({ d: true }),
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

  it('uses GameIDName in game URL', async () => {
    setupHappyPath()
    const games = await fetchYucata('testuser', 'pass')
    expect(games[0].gameUrl).toContain('brassbirmingham')
    expect(games[0].gameUrl).toContain('101')
  })

  it('correctly identifies whose turn it is using UserIsOnTurn', async () => {
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

  it('throws when login returns d:false', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'ASP.NET_SessionId=abc; Path=/' },
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        json: async () => ({ d: false }),
      })
    await expect(fetchYucata('bad', 'creds')).rejects.toThrow('Yucata login failed')
  })
})
