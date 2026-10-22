import { CatalogEntry } from './types'

const BASE = 'https://boardgamers.space'

interface BoardgamersEntry {
  _id: { game: string; version: number }
  public?: boolean
  label?: string
  displayTitle?: { title: string; subtitle?: string }
}

// label is an emoji (sometimes with a leading space) followed by the name,
// e.g. "🏛️ Clash of Cultures: Monumental edition" — displayTitle, where
// present, is cleaner (title/subtitle already split out) and preferred.
const LEADING_EMOJI_RE = /^\s*[\p{Extended_Pictographic}️‍]+\s*/u

function nameOf(g: BoardgamersEntry): string {
  if (g.displayTitle?.title) {
    return g.displayTitle.subtitle ? `${g.displayTitle.title}: ${g.displayTitle.subtitle}` : g.displayTitle.title
  }
  return (g.label ?? g._id.game).replace(LEADING_EMOJI_RE, '').trim()
}

export function parseBoardgamersCatalog(json: string): CatalogEntry[] {
  const games: BoardgamersEntry[] = JSON.parse(json)
  const bySlug = new Map<string, CatalogEntry>()
  for (const g of games) {
    // Older versions of the same game are listed too (one row per version) —
    // only need it once
    if (!g.public || bySlug.has(g._id.game)) continue
    bySlug.set(g._id.game, { name: nameOf(g), url: `${BASE}/boardgame/${g._id.game}` })
  }
  return [...bySlug.values()]
}

export async function fetchBoardgamersCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch(`${BASE}/api/boardgame/info`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Boardgamers.space catalog fetch failed: HTTP ${res.status}`)
  return parseBoardgamersCatalog(await res.text())
}
