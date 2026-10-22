import { parseOBGCatalog, fetchOBGCatalog } from '@/lib/catalogs/obg'

describe('parseOBGCatalog', () => {
  it('lists every known OBG game type, sorted, linking to the site itself (no per-title URL exists)', () => {
    const catalog = parseOBGCatalog()
    expect(catalog.length).toBeGreaterThan(0)
    expect(catalog).toEqual([...catalog].sort((a, b) => a.name.localeCompare(b.name)))
    expect(catalog.every(g => g.url === 'https://www.onlineboardgamers.com')).toBe(true)
    expect(catalog.map(g => g.name)).toEqual(expect.arrayContaining(['Food Chain Magnate', 'Indonesia', 'Keyflower']))
  })
})

describe('fetchOBGCatalog', () => {
  it('resolves to the same list — no network call needed', async () => {
    expect(await fetchOBGCatalog()).toEqual(parseOBGCatalog())
  })
})
