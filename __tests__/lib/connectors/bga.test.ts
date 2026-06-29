import { fetchBGA } from '@/lib/connectors/bga'
import fixture from '@/__fixtures__/bga-games.json'

const mockFetch = jest.fn()
global.fetch = mockFetch

const TOKEN = 'a'.repeat(64)

function makeMockHeaders(cookies: string[], extra: Record<string, string> = {}): Headers {
  return {
    getSetCookie: () => cookies,
    get: (name: string) => {
      if (name === 'set-cookie') return cookies.join(', ') || null
      return extra[name.toLowerCase()] ?? null
    },
  } as unknown as Headers
}

function makeInitResponse() {
  return {
    ok: true,
    status: 302,
    headers: makeMockHeaders(
      ['PHPSESSID=session123; Path=/; HttpOnly'],
      { location: 'https://en.boardgamearena.com/account' }
    ),
  }
}

function makeRedirectFollowResponse() {
  return {
    ok: true,
    status: 200,
    headers: makeMockHeaders([]),
  }
}

function makeLoginPageResponse(token = TOKEN) {
  return {
    ok: true,
    status: 200,
    text: async () => `<html><script>var request_token = '${token}'</script></html>`,
    headers: makeMockHeaders([]),
  }
}

// Login response uses user_id (not id) — matches real BGA API
function makeLoginResponse(playerId: string | number) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ status: 1, data: { user_id: String(playerId), username: 'testuser' } }),
    headers: makeMockHeaders(['TournoiEnLigneidt=postLoginToken; Path=/; HttpOnly']),
  }
}

function makeTablesResponse(data: object) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
    headers: makeMockHeaders([]),
  }
}

function makeGamepanelResponse(displayName: string) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      `<html><head><meta property="og:title" content="Play ${displayName} online from your browser"/></head></html>`,
    headers: makeMockHeaders([]),
  }
}

// fixture has 2 games: imperialsettlers → "Imperial Settlers", terraformingmars → "Terraforming Mars"
function setupHappyPath(playerId = '42', tables: object = fixture, gamepanelResponses: Array<{ slug: string; name: string }> = [
  { slug: 'imperialsettlers', name: 'Imperial Settlers' },
  { slug: 'terraformingmars', name: 'Terraforming Mars' },
]) {
  let mock = mockFetch
    .mockResolvedValueOnce(makeInitResponse())
    .mockResolvedValueOnce(makeRedirectFollowResponse())
    .mockResolvedValueOnce(makeLoginPageResponse())
    .mockResolvedValueOnce(makeLoginResponse(playerId))
    .mockResolvedValueOnce(makeTablesResponse(tables))
  for (const { name } of gamepanelResponses) {
    mock = mock.mockResolvedValueOnce(makeGamepanelResponse(name))
  }
}

describe('fetchBGA', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns Game[] from API response', async () => {
    setupHappyPath()
    const games = await fetchBGA('user@example.com', 'password')
    expect(games.length).toBe(2)
    expect(games[0]).toMatchObject({
      platform: 'bga',
      id: expect.stringMatching(/^bga:/),
      myTurn: expect.any(Boolean),
      gameUrl: expect.stringContaining('boardgamearena.com'),
      gameName: expect.any(String),
    })
  })

  it('resolves display names from gamepanel og:title', async () => {
    setupHappyPath()
    const games = await fetchBGA('user@example.com', 'password')

    const imperialSettlers = games.find(g => g.id === 'bga:12345')!
    expect(imperialSettlers.gameName).toBe('Imperial Settlers')

    const terraformingMars = games.find(g => g.id === 'bga:67890')!
    expect(terraformingMars.gameName).toBe('Terraforming Mars')
  })

  it('decodes HTML entities and collapses whitespace in display names', async () => {
    const singleTable = {
      status: 1,
      data: {
        tables: {
          '11111': {
            id: '11111',
            game_name: 'throughtheagesnewstory',
            status: 'asyncplay',
            gamestart: 1750000000,
            scheduled: 1749990000,
            players: {
              '42': { id: '42', fullname: 'testuser', myturn: '1', think_seconds: '3600' },
            },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(singleTable))
      // og:title split across two lines, with HTML entity
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          `<html><head><meta property="og:title" content="Play Through the Ages: A new Story of\nCivilization online from your browser"/></head></html>`,
        headers: makeMockHeaders([]),
      })

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0].gameName).toBe('Through the Ages: A new Story of Civilization')
  })

  it('falls back to slug when all gamepanel fetch attempts fail', async () => {
    const singleTable = {
      status: 1,
      data: {
        tables: {
          '11111': {
            id: '11111',
            game_name: 'someslug',
            status: 'asyncplay',
            gamestart: 1750000000,
            scheduled: 1749990000,
            players: {
              '42': { id: '42', fullname: 'testuser', myturn: '1', think_seconds: '3600' },
            },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(singleTable))
      .mockRejectedValueOnce(new Error('network error'))   // attempt 0
      .mockRejectedValueOnce(new Error('network error'))   // attempt 1 (retry)

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0].gameName).toBe('someslug')
  })

  it('resolves display name on retry when first gamepanel fetch fails', async () => {
    const singleTable = {
      status: 1,
      data: {
        tables: {
          '11111': {
            id: '11111',
            game_name: 'someslug',
            status: 'asyncplay',
            gamestart: 1750000000,
            scheduled: 1749990000,
            players: {
              '42': { id: '42', fullname: 'testuser', myturn: '1', think_seconds: '3600' },
            },
          },
        },
      },
    }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(singleTable))
      .mockRejectedValueOnce(new Error('network error'))   // attempt 0 fails
      .mockResolvedValueOnce(makeGamepanelResponse('Some Game')) // attempt 1 succeeds

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0].gameName).toBe('Some Game')
  })

  it('falls back to slug when gamepanel returns non-ok status', async () => {
    const singleTable = {
      status: 1,
      data: {
        tables: {
          '11111': {
            id: '11111',
            game_name: 'someslug',
            status: 'asyncplay',
            gamestart: 1750000000,
            scheduled: 1749990000,
            players: {
              '42': { id: '42', fullname: 'testuser', myturn: '1', think_seconds: '3600' },
            },
          },
        },
      },
    }
    const errorResponse = { ok: false, status: 429, text: async () => 'Too Many Requests', headers: makeMockHeaders([]) }
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(singleTable))
      .mockResolvedValueOnce(errorResponse)   // attempt 0: 429
      .mockResolvedValueOnce(errorResponse)   // attempt 1: 429

    const games = await fetchBGA('user@example.com', 'password')
    expect(games[0].gameName).toBe('someslug')
  })

  it('correctly identifies whose turn it is', async () => {
    setupHappyPath()
    const games = await fetchBGA('user@example.com', 'password')

    // Game 12345: myturn=1 on player 99 (alice), me=42 → NOT my turn
    const game1 = games.find(g => g.id === 'bga:12345')!
    expect(game1.myTurn).toBe(false)
    expect(game1.currentPlayer).toBe('alice')

    // Game 67890: myturn=1 on player 42 (me) → MY turn
    const game2 = games.find(g => g.id === 'bga:67890')!
    expect(game2.myTurn).toBe(true)
  })

  it('returns empty array when no tables exist', async () => {
    setupHappyPath('42', { status: 1, data: { tables: {} } }, [])
    const games = await fetchBGA('user@example.com', 'password')
    expect(games).toHaveLength(0)
  })

  it('throws when request_token cannot be extracted from login page', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body>no token here</body></html>',
        headers: makeMockHeaders([]),
      })

    await expect(fetchBGA('user@example.com', 'password')).rejects.toThrow('BGA: could not extract request_token')
  })

  it('throws when login returns non-JSON', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        text: async () => '<!DOCTYPE html>',
        headers: makeMockHeaders([]),
      })

    await expect(fetchBGA('user@example.com', 'password')).rejects.toThrow('BGA login HTTP 302')
  })

  it('throws when login status is not 1', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 200,
        text: async () => JSON.stringify({ status: 0, error: 'Wrong credentials' }),
        headers: makeMockHeaders([]),
      })

    await expect(fetchBGA('user@example.com', 'password')).rejects.toThrow('BGA login failed: Wrong credentials')
  })

  it('throws when login response contains no request token cookie', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeRedirectFollowResponse())
      .mockResolvedValueOnce(makeLoginPageResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: 1, data: { user_id: '42' } }),
        headers: makeMockHeaders([]),
      })

    await expect(fetchBGA('user@example.com', 'password')).rejects.toThrow('BGA: no request token in login response cookies')
  })
})
