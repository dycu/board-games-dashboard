import { Platform, PLATFORM_URLS } from '../types'
import { CatalogEntry } from '../catalogs/types'
import { CatalogPlatform, CATALOG_PLATFORMS } from '../catalogs/cache'
import { matchCatalog } from '../catalogs/match'

// A catalog match below this is too loose to send someone to start a game of it
const MIN_SCORE = 0.9

export interface PlayUrlInput {
  platform: Platform
  gameName: string
  playUrl?: string  // from a Search result — already the right page
  gameUrl?: string  // a played table's URL
}

// BGA table URLs are /{gameserver}/{slug}?table=ID or /{slug}?table=ID; game panels are /gamepanel?game={slug}
export function bgaSlugFromTableUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.searchParams.has('game')) return u.searchParams.get('game')
    if (!u.searchParams.has('table')) return null
    return u.pathname.split('/').filter(Boolean).pop() ?? null
  } catch {
    return null
  }
}

export async function resolvePlayUrl(
  input: PlayUrlInput,
  getCatalog: (p: CatalogPlatform) => Promise<CatalogEntry[]>,
): Promise<string> {
  const home = PLATFORM_URLS[input.platform]
  if (input.playUrl && /^https?:\/\//.test(input.playUrl)) return input.playUrl

  if (input.platform === 'bga' && input.gameUrl) {
    const slug = bgaSlugFromTableUrl(input.gameUrl)
    if (slug) return `https://boardgamearena.com/gamepanel?game=${encodeURIComponent(slug)}`
  }

  if ((CATALOG_PLATFORMS as Platform[]).includes(input.platform)) {
    try {
      const [best] = matchCatalog(input.gameName, await getCatalog(input.platform as CatalogPlatform))
      if (best && best.score >= MIN_SCORE) return best.url
    } catch {
      // catalog unavailable — the home page still works
    }
  }
  return home
}
