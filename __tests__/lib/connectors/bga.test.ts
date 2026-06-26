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

function makeLoginResponse(playerId: string | number) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ status: 1, data: { id: playerId } }),
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

function setupHappyPath(playerId = '42', tables: object = fixture) {
  mockFetch
    .mockResolvedValueOnce(makeInitResponse())
    .mockResolvedValueOnce(makeRedirectFollowResponse())
    .mockResolvedValueOnce(makeLoginPageResponse())
    .mockResolvedValueOnce(makeLoginResponse(playerId))
    .mockResolvedValueOnce(makeTablesResponse(tables))
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

  it('correctly identifies whose turn it is', async () => {
    setupHappyPath()
    const games = await fetchBGA('user@example.com', 'password')

    // Game 12345: active_player=99, me=42 → NOT my turn
    const wingspan = games.find(g => g.id === 'bga:12345')!
    expect(wingspan.myTurn).toBe(false)
    expect(wingspan.currentPlayer).toBe('alice')

    // Game 67890: active_player=42, me=42 → MY turn
    const agricola = games.find(g => g.id === 'bga:67890')!
    expect(agricola.myTurn).toBe(true)
  })

  it('returns empty array when no tables exist', async () => {
    setupHappyPath('42', { status: 1, data: { tables: [] } })
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
        text: async () => JSON.stringify({ status: 1, data: { id: '42' } }),
        headers: makeMockHeaders([]),
      })

    await expect(fetchBGA('user@example.com', 'password')).rejects.toThrow('BGA: no request token in login response cookies')
  })
})
