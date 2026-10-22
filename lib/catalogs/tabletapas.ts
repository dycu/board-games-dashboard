import { CatalogEntry } from './types'

const BASE = 'https://play.tabletapasgames.com'

// Same engine as BoardTogether (lib/catalogs/boardtogether.ts) — same
// reasoning applies: no per-title deep link, so every match points at the
// library, where the game is actually found and started.
const PLAY_URL = `${BASE}/library`

interface CatalogPayload {
  status: string
  payload: { id: string; metadata: { name: string } }[]
}

export function parseTabletapasCatalog(json: string): CatalogEntry[] {
  const parsed: CatalogPayload = JSON.parse(json)
  return (parsed.payload ?? []).map(g => ({ name: g.metadata.name, url: PLAY_URL }))
}

export async function fetchTabletapasCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch(`${BASE}/api/v1/catalog`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`TableTapas catalog fetch failed: HTTP ${res.status}`)
  return parseTabletapasCatalog(await res.text())
}
