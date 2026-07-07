import { parseRallyCatalog, fetchRallyCatalog } from '@/lib/catalogs/rally'
import { readFileSync } from 'fs'
import { join } from 'path'

const fixture = readFileSync(join(__dirname, '../../../__fixtures__/rally-library.html'), 'utf8')

describe('parseRallyCatalog', () => {
  it('extracts all games from the library page', () => {
    const catalog = parseRallyCatalog(fixture)
    expect(catalog).toEqual([
      { name: '13 Minutes', url: 'https://rally-the-troops.com/13-minutes' },
      { name: 'Paths of Glory', url: 'https://rally-the-troops.com/paths-of-glory' },
      { name: "Washington's War", url: 'https://rally-the-troops.com/washingtons-war' },
      { name: 'Fire & Stone', url: 'https://rally-the-troops.com/fire-stone' },
    ])
  })
})

describe('fetchRallyCatalog', () => {
  const mockFetch = jest.fn()
  beforeEach(() => {
    global.fetch = mockFetch
    mockFetch.mockReset()
  })

  it('fetches the library page and parses it', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => fixture })
    const catalog = await fetchRallyCatalog()
    expect(catalog.length).toBe(4)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://rally-the-troops.com/games/library',
      expect.anything()
    )
  })

  it('throws when the library page fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 })
    await expect(fetchRallyCatalog()).rejects.toThrow('HTTP 502')
  })
})
