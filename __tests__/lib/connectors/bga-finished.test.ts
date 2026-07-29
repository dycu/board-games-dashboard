import { fetchFinishedBGA } from '@/lib/connectors/bga'
import fixture from '@/__fixtures__/bga-finished.json'

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

function setupBGALogin(playerId = '42') {
  mockFetch
    .mockResolvedValueOnce({
      ok: true, status: 302,
      headers: makeMockHeaders(
        ['PHPSESSID=session123; Path=/; HttpOnly'],
        { location: 'https://en.boardgamearena.com/account' }
      ),
    })
    .mockResolvedValueOnce({ ok: true, status: 200, headers: makeMockHeaders([]) })
    .mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => `<html><script>var request_token = '${TOKEN}'</script></html>`,
      headers: makeMockHeaders([]),
    })
    .mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => JSON.stringify({ status: 1, data: { user_id: playerId } }),
      headers: makeMockHeaders([`TournoiEnLigneidt=authtoken123; Path=/`]),
    })
}

describe('fetchFinishedBGA', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns FinishedGame[] from gamestats/getGames', async () => {
    setupBGALogin('42')
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => JSON.stringify(fixture),
      headers: makeMockHeaders([]),
    })

    const games = await fetchFinishedBGA('testuser', 'pass')
    expect(games.length).toBeGreaterThanOrEqual(1)
    const g = games.find(g => g.id === 'bga:55555')!
    expect(g).toMatchObject({
      platform: 'bga',
      gameName: 'brass',
      gameUrl: 'https://boardgamearena.com/brass?table=55555',
      completedAgo: expect.any(String),
    })
    expect(g.completedAt).toBeInstanceOf(Date)
  })

  it('returns empty array when no tables', async () => {
    setupBGALogin('42')
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => JSON.stringify({ status: 1, data: { tables: [], stats: [] } }),
      headers: makeMockHeaders([]),
    })

    const games = await fetchFinishedBGA('testuser', 'pass')
    expect(games).toHaveLength(0)
  })
})
