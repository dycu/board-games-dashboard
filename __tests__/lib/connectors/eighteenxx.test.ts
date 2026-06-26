import { fetchEighteenXX } from '@/lib/connectors/eighteenxx'
import fixture from '@/__fixtures__/eighteenxx-games.json'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('fetchEighteenXX', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns only active Game[] from API response', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '_18xx_session=xyz; Path=/' },
        json: async () => ({ user: { id: 1, name: 'testuser' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fixture,
      })

    const games = await fetchEighteenXX('testuser', 'pass')
    // Should filter out the finished game
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      platform: 'eighteenxx',
      id: expect.stringMatching(/^eighteenxx:/),
      myTurn: expect.any(Boolean),
      gameUrl: expect.stringContaining('18xx.games'),
    })
  })

  it('correctly identifies whose turn it is', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '_18xx_session=xyz; Path=/' },
        json: async () => ({ user: { id: 1, name: 'testuser' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fixture,
      })

    const games = await fetchEighteenXX('testuser', 'pass')
    // Game 111: active_players=[{id:1}], myId=1 → my turn
    const g1 = games.find(g => g.id === 'eighteenxx:111')!
    expect(g1.myTurn).toBe(true)
    // Game 222: active_players=[{id:3}], myId=1 → not my turn
    const g2 = games.find(g => g.id === 'eighteenxx:222')!
    expect(g2.myTurn).toBe(false)
    expect(g2.currentPlayer).toBe('eve')
  })

  it('throws when login fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      headers: { get: () => '' },
      json: async () => ({}),
    })
    await expect(fetchEighteenXX('bad', 'creds')).rejects.toThrow('18xx.games login failed')
  })
})
