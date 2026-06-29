import { fetchFinishedEighteenXX } from '@/lib/connectors/eighteenxx'
import fixture from '@/__fixtures__/eighteenxx-games.json'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('fetchFinishedEighteenXX', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns only finished games', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '_18xx_session=xyz; Path=/' },
        json: async () => ({ user: { id: 1, name: 'testuser' } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const games = await fetchFinishedEighteenXX('testuser', 'pass')
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({
      id: 'eighteenxx:333',
      platform: 'eighteenxx',
      gameName: 'Finished Game',
      gameUrl: 'https://18xx.games/game/333',
      completedAgo: expect.any(String),
    })
    expect(games[0].completedAt).toBeInstanceOf(Date)
  })

  it('returns empty array when no finished games', async () => {
    const activeOnly = (fixture as any[]).filter((g: any) => g.status === 'active')
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '_18xx_session=xyz; Path=/' },
        json: async () => ({ user: { id: 1, name: 'testuser' } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => activeOnly })

    const games = await fetchFinishedEighteenXX('testuser', 'pass')
    expect(games).toHaveLength(0)
  })
})
