import { fetchBGA } from '@/lib/connectors/bga'
import fixture from '@/__fixtures__/bga-games.json'

const mockFetch = jest.fn()
global.fetch = mockFetch

const SESSION = 'test-session-cookie'

function makeTablesMock(data: object) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  }
}

describe('fetchBGA', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns Game[] from API response', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTablesMock(fixture))

    const games = await fetchBGA(SESSION, '42', 'token123')
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
      .mockResolvedValueOnce(makeTablesMock(fixture))

    const games = await fetchBGA(SESSION, '42', 'token123')
    // Game 12345: active_player=99, me=42 → NOT my turn
    const wingspan = games.find(g => g.id === 'bga:12345')!
    expect(wingspan.myTurn).toBe(false)
    expect(wingspan.currentPlayer).toBe('alice')

    // Game 67890: active_player=42, me=42 → MY turn
    const agricola = games.find(g => g.id === 'bga:67890')!
    expect(agricola.myTurn).toBe(true)
  })

  it('returns empty array when no tables exist', async () => {
    mockFetch.mockResolvedValueOnce(makeTablesMock({ status: 1, data: { tables: [] } }))
    const games = await fetchBGA(SESSION, '42', 'token123')
    expect(games).toHaveLength(0)
  })
})
