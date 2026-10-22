import { parseBoardgamersCatalog, fetchBoardgamersCatalog } from '@/lib/catalogs/boardgamers'

const sample = JSON.stringify([
  {
    _id: { game: 'clash', version: 1 },
    public: true,
    label: '🏛️ Clash of Cultures: Monumental edition',
    displayTitle: { title: 'Clash of Cultures', subtitle: 'Monumental edition' },
  },
  { _id: { game: 'container', version: 1 }, public: true, label: '🚢 Container' },
  // A leading space before the emoji, and the same game listed twice (an
  // older version alongside the current one) — both seen on the real API
  { _id: { game: 'gaia-project', version: 1 }, public: true, label: ' 🌏 Gaia Project' },
  { _id: { game: 'gaia-project', version: 2 }, public: true, label: ' 🌏 Gaia Project' },
  { _id: { game: 'puerto-rico', version: 1 }, public: true, displayTitle: { title: 'Puerto Rico', subtitle: '1897 Special Edition' } },
  { _id: { game: 'unlisted', version: 1 }, public: false, label: '👻 Unlisted' },
])

describe('parseBoardgamersCatalog', () => {
  it('prefers displayTitle (title + subtitle) when present', () => {
    const catalog = parseBoardgamersCatalog(sample)
    expect(catalog).toContainEqual({ name: 'Clash of Cultures: Monumental edition', url: 'https://boardgamers.space/boardgame/clash' })
    expect(catalog).toContainEqual({ name: 'Puerto Rico: 1897 Special Edition', url: 'https://boardgamers.space/boardgame/puerto-rico' })
  })

  it('falls back to label with its leading emoji (and any leading space) stripped', () => {
    const catalog = parseBoardgamersCatalog(sample)
    expect(catalog).toContainEqual({ name: 'Container', url: 'https://boardgamers.space/boardgame/container' })
    expect(catalog).toContainEqual({ name: 'Gaia Project', url: 'https://boardgamers.space/boardgame/gaia-project' })
  })

  it('dedupes a game listed under multiple versions', () => {
    const catalog = parseBoardgamersCatalog(sample)
    expect(catalog.filter(g => g.name === 'Gaia Project')).toHaveLength(1)
  })

  it('excludes entries that are not public', () => {
    const catalog = parseBoardgamersCatalog(sample)
    expect(catalog.find(g => g.url.endsWith('/unlisted'))).toBeUndefined()
  })
})

describe('fetchBoardgamersCatalog', () => {
  const mockFetch = jest.fn()
  beforeEach(() => {
    global.fetch = mockFetch
    mockFetch.mockReset()
  })

  it('fetches the public boardgame info endpoint and parses it', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => sample })
    const catalog = await fetchBoardgamersCatalog()
    expect(catalog.length).toBeGreaterThan(0)
    expect(mockFetch).toHaveBeenCalledWith('https://boardgamers.space/api/boardgame/info', expect.anything())
  })

  it('throws on a failed fetch', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(fetchBoardgamersCatalog()).rejects.toThrow('HTTP 500')
  })
})
