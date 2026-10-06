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

  it('throws a distinct error when login requires additional verification', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'ASP.NET_SessionId=abc; Path=/' },
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        json: async () => ({ success: true, verificationRequired: true }),
      })
    await expect(fetchYucata('testuser', 'pass')).rejects.toThrow('verification')
  })

  it('preserves every cookie when a response sets more than one (getSetCookie)', async () => {
    // fetch's headers.get('set-cookie') joins multiple cookies with ", ", which
    // is ambiguous with the comma inside a cookie's own Expires date. Node's
    // headers.getSetCookie() returns them as a proper array instead — make
    // sure we use it and don't silently drop the second cookie.
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => null,
          getSetCookie: () => ['ASP.NET_SessionId=abc; Path=/', 'lang=en; expires=Wed, 08-Sep-2027 00:00:00 GMT; Path=/'],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => null,
          getSetCookie: () => ['ASP.NET_SessionId=renewed; Path=/', 'YucataAuth=xyz; Path=/'],
        },
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => FIXTURE,
      })

    await fetchYucata('testuser', 'pass')

    const gamesCallHeaders = mockFetch.mock.calls[2][1].headers
    expect(gamesCallHeaders.Cookie).toContain('ASP.NET_SessionId=renewed')
    expect(gamesCallHeaders.Cookie).toContain('YucataAuth=xyz')
  })
})

describe('fetchFinishedYucata', () => {
  beforeEach(() => mockFetch.mockReset())

  // Matches the real /api/datatables/{userId}/ranking-details response structure
  const FINISHED_FIXTURE = {
    draw: 1,
    recordsTotal: 2,
    recordsFiltered: 2,
    data: [
      { gameId: 17029767, gameName: 'Tiletum', customGameName: 'Tiletum', finishedOn: '2026-09-22T12:14:54.503Z', finalPosition: 3 },
      { gameId: 16869689, gameName: 'Bruges', customGameName: '', finishedOn: '2026-08-08T01:12:29.247Z', finalPosition: 1 },
    ],
  }

  function setupLogin() {
    mockFetch
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'ASP.NET_SessionId=abc; Path=/' } })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'YucataAuth=xyz; Path=/' }, json: async () => ({ success: true }) })
  }

  it('reads the user ID from the lobby page and returns FinishedGame[]', async () => {
    setupLogin()
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => "<script>\n        var UserID = '1031968';\n</script>" })
      .mockResolvedValueOnce({ ok: true, json: async () => FINISHED_FIXTURE })

    const { fetchFinishedYucata } = await import('@/lib/connectors/yucata')
    const games = await fetchFinishedYucata('testuser', 'pass')

    const [url, init] = mockFetch.mock.calls[3]
    expect(url).toBe('https://www.yucata.de/api/datatables/1031968/ranking-details')
    expect(init.method).toBe('POST')
    expect(init.headers.Cookie).toContain('YucataAuth=xyz')

    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      id: 'yucata:17029767',
      platform: 'yucata',
      gameName: 'Tiletum',
      gameUrl: 'https://www.yucata.de/en/game/17029767',
      completedAgo: expect.any(String),
    })
    expect(games[0].completedAt.toISOString()).toBe('2026-09-22T12:14:54.503Z')
    expect(games[1].gameName).toBe('Bruges') // falls back to gameName when customGameName is empty
  })

  it('throws when the lobby page has no user ID (not logged in)', async () => {
    setupLogin()
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => "var UserID = '';" })
    const { fetchFinishedYucata } = await import('@/lib/connectors/yucata')
    await expect(fetchFinishedYucata('testuser', 'pass')).rejects.toThrow('user ID')
  })

  it('throws on a non-OK finished games response', async () => {
    setupLogin()
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => "var UserID = '42';" })
      .mockResolvedValueOnce({ ok: false, status: 500 })
    const { fetchFinishedYucata } = await import('@/lib/connectors/yucata')
    await expect(fetchFinishedYucata('testuser', 'pass')).rejects.toThrow('HTTP 500')
  })
})
