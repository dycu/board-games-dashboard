import { CatalogEntry } from './types'

const BASE = 'https://boardtogether.games'

// Starting a table needs to be logged in, and there's no per-title deep
// link into the lobby — like 18xx.games, every match just points at the
// page the game is actually found and started from.
const PLAY_URL = `${BASE}/dashboard`

interface CatalogPayload {
  status: string
  payload: { id: string; metadata: { name: string; beta?: boolean } }[]
}

// A beta entry used to be dropped entirely here (confirmed at the time:
// GIPF, YINSH, DVONN, LYNGK, TZAAR and several 18xx titles were beta:true
// and couldn't actually be started) — but beta access on BoardTogether is
// now something an account can have, same as BGA's own alpha/beta games
// (see lib/catalogs/bga.ts), so it's surfaced the same way: tagged with a
// status instead of hidden. diffSource (lib/newGames/diff.ts) already knows
// to report both a first "new (beta)" sighting and a later beta -> public
// promotion from this.
export function parseBoardTogetherCatalog(json: string): CatalogEntry[] {
  const parsed: CatalogPayload = JSON.parse(json)
  return (parsed.payload ?? [])
    .map(g => ({ name: g.metadata.name, url: PLAY_URL, status: g.metadata.beta ? 'beta' : 'public' }))
}

export async function fetchBoardTogetherCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch(`${BASE}/api/v1/catalog`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`BoardTogether catalog fetch failed: HTTP ${res.status}`)
  return parseBoardTogetherCatalog(await res.text())
}
