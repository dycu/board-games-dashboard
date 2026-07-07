import { matchCatalog } from '@/lib/catalogs/match'
import { CatalogEntry } from '@/lib/catalogs/types'

const arkNova: CatalogEntry = { name: 'Ark Nova', url: 'https://example.com/arknova' }
const catan: CatalogEntry = { name: 'CATAN', url: 'https://example.com/catan' }
const catalog: CatalogEntry[] = [arkNova, catan]

describe('matchCatalog', () => {
  it('scores an exact match highest', () => {
    const results = matchCatalog('Ark Nova', catalog)
    expect(results[0]).toEqual({ ...arkNova, score: 1 })
  })

  it('matches on a partial substring query', () => {
    const results = matchCatalog('Nova', catalog)
    expect(results.map(r => r.name)).toContain('Ark Nova')
  })

  it('tolerates a minor typo/rename via edit-distance scoring', () => {
    // "Ark Nvoa" is a transposition typo of "Ark Nova" — not a substring of it
    const results = matchCatalog('Ark Nvoa', catalog)
    expect(results.map(r => r.name)).toContain('Ark Nova')
  })

  it('excludes entries below the similarity threshold', () => {
    const results = matchCatalog('Completely Unrelated Title', catalog)
    expect(results).toEqual([])
  })

  it('caps results at 3, sorted by descending score', () => {
    const bigCatalog: CatalogEntry[] = [
      { name: 'Ark Nova', url: 'a' },
      { name: 'Ark Novaa', url: 'b' },
      { name: 'Ark Nova!', url: 'c' },
      { name: 'Ark Nova?', url: 'd' },
      { name: 'Ark Nova.', url: 'e' },
    ]
    const results = matchCatalog('Ark Nova', bigCatalog)
    expect(results).toHaveLength(3)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })
})
