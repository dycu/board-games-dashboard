import { CatalogEntry } from '../catalogs/types'
import { fetchBgaCatalogLoggedIn } from '../catalogs/bga'
import { fetchEighteenxxCatalog } from '../catalogs/eighteenxx'
import { fetchRallyCatalog } from '../catalogs/rally'
import { fetchYucataCatalog } from '../catalogs/yucata'
import { NewGamesSource, WatchedItem } from './diff'

const YUCATA = 'https://www.yucata.de'

function byUrl(entries: CatalogEntry[]): WatchedItem[] {
  return entries.map(e => ({ key: e.url, name: e.name, url: e.url, ...(e.status && { status: e.status }) }))
}

export function parseYucataBlog(json: unknown): WatchedItem[] {
  if (!Array.isArray(json)) throw new Error('Yucata blog: expected a list of posts')
  return json
    .filter((p: any) => p?.key && p?.title && (p.status ?? 'Published') === 'Published')
    .map((p: any) => ({ key: String(p.key), name: String(p.title), url: `${YUCATA}/en/Blog/${encodeURIComponent(p.key)}` }))
}

async function fetchYucataBlog(): Promise<WatchedItem[]> {
  const res = await fetch(`${YUCATA}/api/blog/posts`, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Yucata blog fetch failed: HTTP ${res.status}`)
  return parseYucataBlog(await res.json())
}

// Each source fetches live (never the 24h search cache) and throws rather
// than returning a partial list, so a bad fetch can't look like new games
export const SOURCES: Record<NewGamesSource, () => Promise<WatchedItem[]>> = {
  // The logged-in list, alpha included; the public fallback would hide alpha games
  bga: async () => byUrl(await fetchBgaCatalogLoggedIn()),
  // Every 18xx entry shares the /new_game URL, so the title is the key
  eighteenxx: async () => (await fetchEighteenxxCatalog()).map(e => ({ key: e.name, name: e.name, url: e.url, ...(e.status && { status: e.status }) })),
  rally: async () => {
    const items = byUrl(await fetchRallyCatalog())
    if (items.length === 0) throw new Error('Rally library: no games found')
    return items
  },
  yucata: async () => {
    const items = byUrl(await fetchYucataCatalog())
    if (items.length === 0) throw new Error('Yucata catalog: no games found')
    return items
  },
  'yucata-blog': fetchYucataBlog,
}
