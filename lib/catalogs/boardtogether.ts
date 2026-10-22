import { CatalogEntry } from './types'

const BASE = 'https://boardtogether.games'

// Starting a table needs to be logged in, and there's no per-title deep
// link into the lobby — like 18xx.games, every match just points at the
// page the game is actually found and started from.
const PLAY_URL = `${BASE}/dashboard`

interface CatalogPayload {
  status: string
  payload: { id: string; metadata: { name: string } }[]
}

export function parseBoardTogetherCatalog(json: string): CatalogEntry[] {
  const parsed: CatalogPayload = JSON.parse(json)
  return (parsed.payload ?? []).map(g => ({ name: g.metadata.name, url: PLAY_URL }))
}

export async function fetchBoardTogetherCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch(`${BASE}/api/v1/catalog`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`BoardTogether catalog fetch failed: HTTP ${res.status}`)
  return parseBoardTogetherCatalog(await res.text())
}
