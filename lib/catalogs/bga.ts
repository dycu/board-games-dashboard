import { CatalogEntry } from './types'
import { withBgaSession, cookieString } from '../connectors/bga'

const GAMELIST_URL = 'https://en.boardgamearena.com/gamelist?section=all'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
}

// Alpha games only appear in game_list for a logged-in member of the
// reviewers group; anonymous visitors get public + beta only.
const LISTED_STATUSES = new Set(['public', 'beta', 'alpha'])

interface ListedGame {
  name?: string
  display_name_en?: string
  status?: string
}

function parseGameList(html: string): ListedGame[] {
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

  return JSON.parse(html.slice(start, end))
}

export function parseBgaCatalog(html: string): CatalogEntry[] {
  return parseGameList(html)
    .filter(g => g.name && g.display_name_en && LISTED_STATUSES.has(g.status ?? ''))
    // The pretty https://boardgamearena.com/<slug> URL currently 500s for anonymous
    // visitors; gamepanel is the reliable public URL (also used in lib/connectors/bga.ts).
    .map(g => ({ name: g.display_name_en!, url: `https://en.boardgamearena.com/gamepanel?game=${g.name}` }))
}

async function fetchGamelist(cookie?: string): Promise<string> {
  if (!cookie) {
    const res = await fetch(GAMELIST_URL, { headers: BROWSER_HEADERS })
    if (!res.ok) throw new Error(`BGA gamelist fetch failed: HTTP ${res.status}`)
    return res.text()
  }
  // BGA bounces logged-in visitors between en.boardgamearena.com and
  // boardgamearena.com, and fetch drops a hand-set Cookie header on a
  // cross-origin redirect — so follow redirects ourselves, keeping it.
  let url = GAMELIST_URL
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, { headers: { ...BROWSER_HEADERS, Cookie: cookie }, redirect: 'manual' })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).toString()
      if (!/(^|\.)boardgamearena\.com$/.test(new URL(url).hostname)) throw new Error(`BGA gamelist redirected off-site: ${url}`)
      continue
    }
    if (!res.ok) throw new Error(`BGA gamelist fetch failed: HTTP ${res.status}`)
    return res.text()
  }
  throw new Error('BGA gamelist: too many redirects')
}

export async function fetchBgaCatalog(): Promise<CatalogEntry[]> {
  const username = process.env.BGA_USERNAME
  const password = process.env.BGA_PASSWORD
  if (username && password) {
    try {
      // Uses the shared cached session, so this normally costs no extra login.
      // The catalog is cached for a day, so at most one re-login per day comes from here.
      return await withBgaSession(username, password, async session => {
        const html = await fetchGamelist(cookieString(session.cookies))
        const games = parseGameList(html)
        // A logged-out page has no alpha games — treat that as an expired session
        if (!games.some(g => g.status === 'alpha')) throw new Error('BGA gamelist: session not logged in (no alpha games)')
        return parseBgaCatalog(html)
      })
    } catch {
      // Login trouble must not break search — fall back to the public list
    }
  }
  return parseBgaCatalog(await fetchGamelist())
}
