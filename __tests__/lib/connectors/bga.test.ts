import { fetchBGA } from '@/lib/connectors/bga'
import fixture from '@/__fixtures__/bga-games.json'

const mockFetch = jest.fn()
global.fetch = mockFetch

function makeMockHeaders(cookies: string[]): Headers {
  return {
    getSetCookie: () => cookies,
    get: (name: string) => name === 'set-cookie' ? cookies.join(', ') : null,
  } as unknown as Headers
}

function makeInitResponse() {
  return {
    ok: true,
    status: 200,
    text: async () => '<html>login page</html>',
    headers: makeMockHeaders([
      'TournoiEnLigneid=preLoginToken; Path=/; HttpOnly',
      'PHPSESSID=session123; Path=/; HttpOnly',
    ]),
  }
}

function makeLoginResponse(playerId: string | number) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ status: 1, data: { id: playerId } }),
    headers: makeMockHeaders([
      'TournoiEnLigneidt=postLoginToken; Path=/; HttpOnly',
    ]),
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

describe('fetchBGA', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns Game[] from API response', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(fixture))

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
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse(fixture))

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
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
      .mockResolvedValueOnce(makeLoginResponse('42'))
      .mockResolvedValueOnce(makeTablesResponse({ status: 1, data: { tables: [] } }))

    const games = await fetchBGA('user@example.com', 'password')
    expect(games).toHaveLength(0)
  })

  it('throws if requestToken cookie is missing from initial response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html></html>',
      headers: makeMockHeaders([]),
    })

    await expect(fetchBGA('user@example.com', 'password')).rejects.toThrow('BGA: failed to obtain requestToken')
  })

  it('throws when login returns non-JSON', async () => {
    mockFetch
      .mockResolvedValueOnce(makeInitResponse())
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
      .mockResolvedValueOnce({
        ok: false,
        status: 200,
        text: async () => JSON.stringify({ status: 0, error: 'Wrong credentials' }),
        headers: makeMockHeaders([]),
      })

    await expect(fetchBGA('user@example.com', 'wrong-password')).rejects.toThrow('BGA login failed: Wrong credentials')
  })
})
