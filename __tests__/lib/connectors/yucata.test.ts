import { fetchYucata } from '@/lib/connectors/yucata'

const mockFetch = jest.fn()
global.fetch = mockFetch

const FIXTURE = {
  d: {
    Games: [
      {
        GameID: 101,
        IdName: 'brassbirmingham',
        GameName: 'Brass: Birmingham',
        CanMove: true,
        Players: [{ Login: 'testuser' }, { Login: 'alice' }, { Login: 'bob' }],
        ActivePlayer: { Login: 'testuser' },
        LastMoveTime: '/Date(1750418400000)/',
      },
      {
        GameID: 202,
        IdName: 'hive',
        GameName: 'Hive',
        CanMove: false,
        Players: [{ Login: 'testuser' }, { Login: 'alice' }],
        ActivePlayer: { Login: 'alice' },
        LastMoveTime: '/Date(1750762800000)/',
      },
    ],
  },
}

function setupHappyPath() {
  mockFetch
    // Step 1: init — get ASP.NET session cookie
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'ASP.NET_SessionId=abc; Path=/' },
    })
    // Step 2: WCF login — returns {d: true} + Yucata auth cookie
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'Yucata=xyz; Path=/' },
      json: async () => ({ d: true }),
    })
    // Step 3: GetLiveGames
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

  it('correctly identifies whose turn it is', async () => {
    setupHappyPath()
    const games = await fetchYucata('testuser', 'pass')
    const g1 = games.find(g => g.id === 'yucata:101')!
    expect(g1.myTurn).toBe(true)
    const g2 = games.find(g => g.id === 'yucata:202')!
    expect(g2.myTurn).toBe(false)
    expect(g2.currentPlayer).toBe('alice')
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
