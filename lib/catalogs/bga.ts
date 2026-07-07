import { CatalogEntry } from './types'

const GAMELIST_URL = 'https://en.boardgamearena.com/gamelist?section=all'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
}

export function parseBgaCatalog(html: string): CatalogEntry[] {
  const marker = '"game_list":'
  const idx = html.indexOf(marker)
  if (idx === -1) throw new Error('BGA: game_list not found in gamelist page')

  const start = idx + marker.length
  let depth = 0
  let end = -1
  for (let i = start; i < html.length; i++) {
    if (html[i] === '[') depth++
    else if (html[i] === ']') {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }
  if (end === -1) throw new Error('BGA: could not find end of game_list array')

  const list: any[] = JSON.parse(html.slice(start, end))
  return list
    .filter(g => g.name && g.display_name_en && g.status === 'public')
    .map(g => ({ name: g.display_name_en, url: `https://boardgamearena.com/${g.name}` }))
}

export async function fetchBgaCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch(GAMELIST_URL, { headers: BROWSER_HEADERS })
  if (!res.ok) throw new Error(`BGA gamelist fetch failed: HTTP ${res.status}`)
  const html = await res.text()
  return parseBgaCatalog(html)
}
