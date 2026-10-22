import { CatalogEntry } from './types'
import { PLATFORM_URLS } from '../types'
import { OBG_GAME_NAMES } from '../connectors/obg'

// The site has no public catalog endpoint (everything needs an account) and
// no per-title "new game" URL either — like 18xx.games, every match points
// at the site itself, where the game is actually found and started. The
// list of titles is the connector's own type-code → name map (see
// lib/connectors/obg.ts), already vetted against real table rows.
export function parseOBGCatalog(): CatalogEntry[] {
  return Object.values(OBG_GAME_NAMES)
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({ name, url: PLATFORM_URLS.obg }))
}

// Not actually async (no network call — see parseOBGCatalog), but matches
// the Promise<CatalogEntry[]> shape every other catalog fetcher has, which
// is what lib/catalogs/cache.ts's FETCHERS table expects.
export async function fetchOBGCatalog(): Promise<CatalogEntry[]> {
  return parseOBGCatalog()
}
