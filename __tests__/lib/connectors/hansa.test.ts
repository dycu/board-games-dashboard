import { fetchHansa } from '@/lib/connectors/hansa'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockFetch = jest.fn()
global.fetch = mockFetch
const fixture = readFileSync(join(__dirname, '../../../__fixtures__/hansa-games.html'), 'utf8')

describe('fetchHansa', () => {
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

    const games = await fetchHansa('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      platform: 'hansa',
      id: expect.stringMatching(/^hansa:/),
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

    const games = await fetchHansa('testuser', 'pass')
    const g1 = games.find(g => g.id === 'hansa:101')!
    expect(g1.myTurn).toBe(true)
    const g2 = games.find(g => g.id === 'hansa:202')!
    expect(g2.myTurn).toBe(false)
    expect(g2.currentPlayer).toBe('alice')
  })

  it('throws when login fails (no cookie)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
    })
    await expect(fetchHansa('bad', 'creds')).rejects.toThrow('Hansa Teutonica login failed')
  })
})
