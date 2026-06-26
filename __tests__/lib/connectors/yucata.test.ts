import { fetchYucata } from '@/lib/connectors/yucata'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockFetch = jest.fn()
global.fetch = mockFetch
const fixture = readFileSync(join(__dirname, '../../../__fixtures__/yucata-games.html'), 'utf8')

describe('fetchYucata', () => {
  beforeEach(() => mockFetch.mockClear())

  it('returns Game[] from scraped HTML', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'session=abc; Path=/' },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => fixture,
      })

    const games = await fetchYucata('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      platform: 'yucata',
      id: expect.stringMatching(/^yucata:/),
      myTurn: expect.any(Boolean),
    })
  })

  it('correctly identifies my-turn from CSS class', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'session=abc; Path=/' },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => fixture,
      })

    const games = await fetchYucata('testuser', 'pass')
    const g1 = games.find(g => g.id === 'yucata:101')!
    expect(g1.myTurn).toBe(true)
    const g2 = games.find(g => g.id === 'yucata:202')!
    expect(g2.myTurn).toBe(false)
    expect(g2.currentPlayer).toBe('alice')
  })

  it('throws when login fails (no cookie)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
    })
    await expect(fetchYucata('bad', 'creds')).rejects.toThrow('Yucata login failed')
  })
})
