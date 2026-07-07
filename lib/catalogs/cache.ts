import { kv } from '@vercel/kv'
import { CatalogEntry } from './types'
import { fetchBgaCatalog } from './bga'
import { fetchYucataCatalog } from './yucata'
import { fetchRallyCatalog } from './rally'

export type CatalogPlatform = 'bga' | 'yucata' | 'rally'

export const CATALOG_PLATFORMS: CatalogPlatform[] = ['bga', 'yucata', 'rally']

const TTL_SECONDS = 86400

// Bump when a cached CatalogEntry's shape or content changes, so stale
// entries from a prior deploy are bypassed instead of served for up to
// TTL_SECONDS after the fix ships (e.g. the v1 BGA entries cached the
// broken boardgamearena.com/<slug> URL, not the gamepanel one).
const CACHE_VERSION = 'v2'

const FETCHERS: Record<CatalogPlatform, () => Promise<CatalogEntry[]>> = {
  bga: fetchBgaCatalog,
  yucata: fetchYucataCatalog,
  rally: fetchRallyCatalog,
}

function cacheKey(platform: CatalogPlatform): string {
  return `game-catalog:${CACHE_VERSION}:${platform}`
}

export async function getCatalog(platform: CatalogPlatform): Promise<CatalogEntry[]> {
  try {
    const cached = await kv.get<CatalogEntry[]>(cacheKey(platform))
    if (cached) return cached
  } catch {
    // KV unavailable — fall through to a live fetch
  }

  const fresh = await FETCHERS[platform]()

  try {
    await kv.set(cacheKey(platform), fresh, { ex: TTL_SECONDS })
  } catch {
    // caching is best-effort; the search still works without it
  }

  return fresh
}
