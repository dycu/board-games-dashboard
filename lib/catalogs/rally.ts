import { CatalogEntry } from './types'

const BASE = 'https://rally-the-troops.com'
const LIBRARY_URL = `${BASE}/games/library`

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#39;/g, "'")
}

export function parseRallyCatalog(html: string): CatalogEntry[] {
  const entries: CatalogEntry[] = []
  const re = /<a class="black" href="(\/[^"]+)">[\s\S]*?<div>([^<]+)<\/div><\/a>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    entries.push({ name: decodeEntities(m[2]), url: `${BASE}${m[1]}` })
  }
  return entries
}

export async function fetchRallyCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch(LIBRARY_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Rally library fetch failed: HTTP ${res.status}`)
  const html = await res.text()
  return parseRallyCatalog(html)
}
