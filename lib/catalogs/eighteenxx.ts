import { CatalogEntry } from './types'

const BASE = 'https://18xx.games'

// The site has no titles API; its Opal-compiled client bundle holds one
// `engine/game/<module>/meta` module per title, with GAME_TITLE (when the title
// isn't just the module name) and DEV_STAGE (missing = production).
const META_RE = /Opal\.modules\["engine\/game\/([a-z0-9_]+)\/meta"\]/g

// g_18_royal_gorge -> 18RoyalGorge (Ruby's G18RoyalGorge class without the G)
export function titleFromModule(mod: string): string {
  return mod.replace(/^g_/, '').split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

export function parseEighteenxxCatalog(js: string): CatalogEntry[] {
  const starts = [...js.matchAll(META_RE)].map(m => ({ mod: m[1], at: m.index }))
  const entries: CatalogEntry[] = []
  starts.forEach(({ mod, at }) => {
    // A module's body runs until the next module of any kind
    const next = js.indexOf('Opal.modules[', at + 1)
    const body = js.slice(at, next === -1 ? undefined : next)
    if (body.match(/'DEV_STAGE', "([a-z]+)"/)?.[1] === 'prealpha') return
    const name = body.match(/'GAME_TITLE', "([^"]+)"/)?.[1] ?? titleFromModule(mod)
    // There's no link that preselects a title; the new game page has a title search
    entries.push({ name, url: `${BASE}/new_game` })
  })
  if (entries.length === 0) throw new Error('18xx: no game titles found in the site bundle')
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export async function fetchEighteenxxCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch(`${BASE}/assets/main.js`)
  if (!res.ok) throw new Error(`18xx bundle fetch failed: HTTP ${res.status}`)
  return parseEighteenxxCatalog(await res.text())
}
