import { parseTabletapasCatalog, fetchTabletapasCatalog } from '@/lib/catalogs/tabletapas'

const sample = JSON.stringify({
  status: 'ok',
  payload: [
    { id: 'stellarventures', metadata: { name: 'Stellar Ventures' }, thumbnailUrl: 'x' },
    { id: 'locust', metadata: { name: 'Locust: Swarm or Die' }, thumbnailUrl: 'x' },
  ],
})

describe('parseTabletapasCatalog', () => {
  it('maps each catalog entry to its display name, linking to the library (no per-title URL exists)', () => {
    expect(parseTabletapasCatalog(sample)).toEqual([
      { name: 'Stellar Ventures', url: 'https://play.tabletapasgames.com/library' },
      { name: 'Locust: Swarm or Die', url: 'https://play.tabletapasgames.com/library' },
    ])
  })
})

describe('fetchTabletapasCatalog', () => {
  const mockFetch = jest.fn()
  beforeEach(() => {
    global.fetch = mockFetch
    mockFetch.mockReset()
  })

  it('fetches the catalog endpoint and parses it', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => sample })
    const catalog = await fetchTabletapasCatalog()
    expect(catalog).toHaveLength(2)
    expect(mockFetch).toHaveBeenCalledWith('https://play.tabletapasgames.com/api/v1/catalog', expect.anything())
  })

  it('throws on a failed fetch', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(fetchTabletapasCatalog()).rejects.toThrow('HTTP 500')
  })
})
