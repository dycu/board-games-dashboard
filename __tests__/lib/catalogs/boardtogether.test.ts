import { parseBoardTogetherCatalog, fetchBoardTogetherCatalog } from '@/lib/catalogs/boardtogether'

const sample = JSON.stringify({
  status: 'ok',
  payload: [
    { id: 'bridges', metadata: { name: 'The Bridges of Shangri-La', designer: 'Leo Colovini' }, thumbnailUrl: 'x' },
    { id: 'estates', metadata: { name: 'The Estates' }, thumbnailUrl: 'x' },
  ],
})

describe('parseBoardTogetherCatalog', () => {
  it('maps each catalog entry to its display name, linking to the dashboard (no per-title URL exists)', () => {
    expect(parseBoardTogetherCatalog(sample)).toEqual([
      { name: 'The Bridges of Shangri-La', url: 'https://boardtogether.games/dashboard' },
      { name: 'The Estates', url: 'https://boardtogether.games/dashboard' },
    ])
  })

  it('returns an empty list when the payload is missing', () => {
    expect(parseBoardTogetherCatalog(JSON.stringify({ status: 'ok' }))).toEqual([])
  })

  // Confirmed against the real catalog: GIPF, YINSH, DVONN, LYNGK, TZAAR and
  // several 18xx titles are all beta:true and can't actually be started —
  // listing them as available (in search or as a "new game" find) points at
  // something there's no real game to join.
  it('drops a beta entry — it is listed but not actually playable', () => {
    const withBeta = JSON.stringify({
      status: 'ok',
      payload: [
        { id: 'yinsh', metadata: { name: 'YINSH', beta: true } },
        { id: 'estates', metadata: { name: 'The Estates', beta: false } },
        { id: 'rides', metadata: { name: 'Ride the Rails' } }, // no beta field at all — treated as released
      ],
    })
    expect(parseBoardTogetherCatalog(withBeta)).toEqual([
      { name: 'The Estates', url: 'https://boardtogether.games/dashboard' },
      { name: 'Ride the Rails', url: 'https://boardtogether.games/dashboard' },
    ])
  })
})

describe('fetchBoardTogetherCatalog', () => {
  const mockFetch = jest.fn()
  beforeEach(() => {
    global.fetch = mockFetch
    mockFetch.mockReset()
  })

  it('fetches the catalog endpoint and parses it', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => sample })
    const catalog = await fetchBoardTogetherCatalog()
    expect(catalog).toHaveLength(2)
    expect(mockFetch).toHaveBeenCalledWith('https://boardtogether.games/api/v1/catalog', expect.anything())
  })

  it('throws on a failed fetch', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(fetchBoardTogetherCatalog()).rejects.toThrow('HTTP 500')
  })
})
