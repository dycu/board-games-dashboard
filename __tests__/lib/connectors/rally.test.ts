import { fetchRally } from '@/lib/connectors/rally'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockFetch = jest.fn()
global.fetch = mockFetch
const fixture = readFileSync(join(__dirname, '../../../__fixtures__/rally-games.html'), 'utf8')

describe('fetchRally', () => {
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

    const games = await fetchRally('testuser', 'pass')
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      platform: 'rally',
      id: expect.stringMatching(/^rally:/),
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

    const games = await fetchRally('testuser', 'pass')
    const g1 = games.find(g => g.id === 'rally:101')!
    expect(g1.myTurn).toBe(true)
    const g2 = games.find(g => g.id === 'rally:202')!
    expect(g2.myTurn).toBe(false)
    expect(g2.currentPlayer).toBe('alice')
  })

  it('throws when login fails (no cookie)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
    })
    await expect(fetchRally('bad', 'creds')).rejects.toThrow('Rally the Troops login failed')
  })
})
