import { CatalogEntry } from '../catalogs/types'
import { fetchBgaCatalogLoggedIn } from '../catalogs/bga'
import { fetchEighteenxxCatalog } from '../catalogs/eighteenxx'
import { fetchRallyCatalog } from '../catalogs/rally'
import { fetchYucataCatalog } from '../catalogs/yucata'
import { setCatalog } from '../catalogs/cache'
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
// than returning a partial list, so a bad fetch can't look like new games.
// For the four that are also what "Find a game" searches (bga, eighteenxx,
// rally, yucata — not yucata-blog, which isn't a game catalog), the fresh
// result also refreshes that search cache (see lib/catalogs/cache.ts),
// so a game that only just appeared doesn't stay invisible to search for up
// to a day until that cache would otherwise expire on its own.
export const SOURCES: Record<NewGamesSource, () => Promise<WatchedItem[]>> = {
  // The logged-in list, alpha included; the public fallback would hide alpha games
  bga: async () => {
    const entries = await fetchBgaCatalogLoggedIn()
    await setCatalog('bga', entries)
    return byUrl(entries)
  },
  // Every 18xx entry shares the /new_game URL, so the title is the key
  eighteenxx: async () => {
    const entries = await fetchEighteenxxCatalog()
    await setCatalog('eighteenxx', entries)
    return entries.map(e => ({ key: e.name, name: e.name, url: e.url, ...(e.status && { status: e.status }) }))
  },
  rally: async () => {
    const entries = await fetchRallyCatalog()
    const items = byUrl(entries)
    if (items.length === 0) throw new Error('Rally library: no games found')
    await setCatalog('rally', entries)
    return items
  },
  yucata: async () => {
    const entries = await fetchYucataCatalog()
    const items = byUrl(entries)
    if (items.length === 0) throw new Error('Yucata catalog: no games found')
    await setCatalog('yucata', entries)
    return items
  },
  'yucata-blog': fetchYucataBlog,
}
