import { CatalogEntry } from '../catalogs/types'
import { fetchBgaCatalogLoggedIn } from '../catalogs/bga'
import { fetchEighteenxxCatalog } from '../catalogs/eighteenxx'
import { fetchRallyCatalog } from '../catalogs/rally'
import { fetchYucataCatalog } from '../catalogs/yucata'
import { fetchChoochooCatalog } from '../catalogs/choochoo'
import { fetchBoardgamersCatalog } from '../catalogs/boardgamers'
import { fetchBoardTogetherCatalog } from '../catalogs/boardtogether'
import { setCatalog } from '../catalogs/cache'
import { NewGamesSource, WatchedItem } from './diff'

function byUrl(entries: CatalogEntry[]): WatchedItem[] {
  return entries.map(e => ({ key: e.url, name: e.name, url: e.url, ...(e.status && { status: e.status }) }))
}

// Each source fetches live (never the 24h search cache) and throws rather
// than returning a partial list, so a bad fetch can't look like new games.
// Every source here is also what "Find a game" searches, so the fresh
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
  choochoo: async () => {
    const entries = await fetchChoochooCatalog()
    const items = byUrl(entries)
    if (items.length === 0) throw new Error('choochoo: no maps found')
    await setCatalog('choochoo', entries)
    return items
  },
  boardgamers: async () => {
    const entries = await fetchBoardgamersCatalog()
    const items = byUrl(entries)
    if (items.length === 0) throw new Error('Boardgamers.space catalog: no games found')
    await setCatalog('boardgamers', entries)
    return items
  },
  // Every boardtogether entry shares the same /dashboard URL (no per-title
  // deep link, like 18xx), so the title is the key
  boardtogether: async () => {
    const entries = await fetchBoardTogetherCatalog()
    if (entries.length === 0) throw new Error('BoardTogether catalog: no games found')
    await setCatalog('boardtogether', entries)
    return entries.map(e => ({ key: e.name, name: e.name, url: e.url, ...(e.status && { status: e.status }) }))
  },
}
