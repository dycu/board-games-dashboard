import { parseBgaCatalog, fetchBgaCatalog } from '@/lib/catalogs/bga'
import { readFileSync } from 'fs'
import { join } from 'path'

const fixture = readFileSync(join(__dirname, '../../../__fixtures__/bga-gamelist.html'), 'utf8')

describe('parseBgaCatalog', () => {
  it('extracts public games with their slug-based URL', () => {
    const catalog = parseBgaCatalog(fixture)
    expect(catalog).toEqual(expect.arrayContaining([
      { name: 'Ark Nova', url: 'https://boardgamearena.com/arknova' },
      { name: 'CATAN', url: 'https://boardgamearena.com/catan' },
      { name: 'Brass: Birmingham', url: 'https://boardgamearena.com/brasstrent' },
    ]))
  })

  it('excludes non-public games', () => {
    const catalog = parseBgaCatalog(fixture)
    expect(catalog.find(g => g.name === 'Hidden Prototype')).toBeUndefined()
  })

  it('throws when game_list is missing from the page', () => {
    expect(() => parseBgaCatalog('<html>no data here</html>')).toThrow('game_list')
  })
})

describe('fetchBgaCatalog', () => {
  const mockFetch = jest.fn()
  beforeEach(() => {
    global.fetch = mockFetch
    mockFetch.mockReset()
  })

  it('fetches the gamelist page and parses it', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => fixture })
    const catalog = await fetchBgaCatalog()
    expect(catalog.length).toBe(3)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://en.boardgamearena.com/gamelist?section=all',
      expect.anything()
    )
  })

  it('throws when the page fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 })
    await expect(fetchBgaCatalog()).rejects.toThrow('HTTP 503')
  })
})
