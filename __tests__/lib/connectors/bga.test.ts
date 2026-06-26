import { fetchBGA } from '@/lib/connectors/bga'
import fixture from '@/__fixtures__/bga-games.json'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('fetchBGA', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns Game[] from API response', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'PHPSESSID=abc123; Path=/' },
        json: async () => ({ status: 1, data: { id: '42' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fixture,
      })

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
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'PHPSESSID=abc123; Path=/' },
        json: async () => ({ status: 1, data: { id: '42' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fixture,
      })

    const games = await fetchBGA('user@example.com', 'password')
    // Game 12345: active_player=99, me=42 → NOT my turn
    const wingspan = games.find(g => g.id === 'bga:12345')!
    expect(wingspan.myTurn).toBe(false)
    expect(wingspan.currentPlayer).toBe('alice')

    // Game 67890: active_player=42, me=42 → MY turn
    const agricola = games.find(g => g.id === 'bga:67890')!
    expect(agricola.myTurn).toBe(true)
  })

  it('throws when login fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => '' },
      json: async () => ({ status: 0 }),
    })
    await expect(fetchBGA('bad', 'creds')).rejects.toThrow('BGA login failed')
  })
})
