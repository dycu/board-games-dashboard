import { CatalogEntry } from './types'

const WCF = 'https://www.yucata.de/Services/YucataService.svc'
const NAMES_URL = 'https://www.yucata.de/locales/en/games.json'
const BASE = 'https://www.yucata.de'

export function parseYucataCatalog(gamesWithTagsJson: string, namesJson: string): CatalogEntry[] {
  const parsed = JSON.parse(gamesWithTagsJson)
  const games: any[] = parsed?.d?.Games ?? []
  const names = JSON.parse(namesJson)
  const fullNames: Record<string, string> = names?.FullName ?? {}

  return games
    .filter(g => g.IdName)
    .map(g => ({
      name: fullNames[g.IdName] ?? g.IdName,
      url: `${BASE}/en/Rules/${g.IdName}`,
    }))
}

export async function fetchYucataCatalog(): Promise<CatalogEntry[]> {
  const gamesRes = await fetch(`${WCF}/GetGamesWithTags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: '{}',
  })
  if (!gamesRes.ok) throw new Error(`Yucata GetGamesWithTags fetch failed: HTTP ${gamesRes.status}`)

  const namesRes = await fetch(NAMES_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!namesRes.ok) throw new Error(`Yucata games.json fetch failed: HTTP ${namesRes.status}`)

  const gamesText = await gamesRes.text()
  const namesText = await namesRes.text()
  return parseYucataCatalog(gamesText, namesText)
}
