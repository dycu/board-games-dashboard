import { parseYucataCatalog, fetchYucataCatalog } from '@/lib/catalogs/yucata'
import { readFileSync } from 'fs'
import { join } from 'path'

const gamesFixture = readFileSync(join(__dirname, '../../../__fixtures__/yucata-gamelist.json'), 'utf8')
const namesFixture = readFileSync(join(__dirname, '../../../__fixtures__/yucata-gamenames.json'), 'utf8')

describe('parseYucataCatalog', () => {
  it('maps IdName to its full display name and a Rules URL', () => {
    const catalog = parseYucataCatalog(gamesFixture, namesFixture)
    expect(catalog).toEqual(expect.arrayContaining([
      { name: 'Pax Porfiriana', url: 'https://www.yucata.de/en/Rules/PaxPorfiriana' },
      { name: 'Brass: Birmingham', url: 'https://www.yucata.de/en/Rules/BrassBirmingham' },
      { name: 'Hive', url: 'https://www.yucata.de/en/Rules/Hive' },
    ]))
  })

  it('falls back to IdName when no display name is found', () => {
    const catalog = parseYucataCatalog(gamesFixture, namesFixture)
    expect(catalog.find(g => g.url.endsWith('/NoNameEntry'))).toEqual({
      name: 'NoNameEntry',
      url: 'https://www.yucata.de/en/Rules/NoNameEntry',
    })
  })
})

describe('fetchYucataCatalog', () => {
  const mockFetch = jest.fn()
  beforeEach(() => {
    global.fetch = mockFetch
    mockFetch.mockReset()
  })

  it('fetches both endpoints and parses the combined result', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => gamesFixture })
      .mockResolvedValueOnce({ ok: true, text: async () => namesFixture })
    const catalog = await fetchYucataCatalog()
    expect(catalog.length).toBe(4)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.yucata.de/api/gameinfo/metatags',
      expect.anything()
    )
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.yucata.de/locales/en/games.json',
      expect.anything()
    )
  })

  it('throws when the games endpoint fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, text: async () => namesFixture })
    await expect(fetchYucataCatalog()).rejects.toThrow('HTTP 500')
  })
})
