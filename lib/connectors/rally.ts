import { Game, FinishedGame } from '../types'
import { formatTimeAgo } from './utils'

export const BASE = 'https://rally-the-troops.com'

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*',
}

interface AltchaChallenge {
  algorithm: string
  challenge: string
  maxnumber: number
  salt: string
  signature: string
}

const ALTCHA_ENC = new TextEncoder()
// maxnumber is commonly 100,000 — hashing one at a time can take several
// seconds if the answer lands near the top of the range. Batching the
// (independent) digest calls lets them run concurrently instead of one
// Promise tick at a time, cutting wall-clock time substantially without
// changing which n is found (still the lowest one that matches).
const ALTCHA_BATCH = 200

async function solveAltcha(ch: AltchaChallenge): Promise<string> {
  for (let base = 0; base <= ch.maxnumber; base += ALTCHA_BATCH) {
    const size = Math.min(ALTCHA_BATCH, ch.maxnumber - base + 1)
    const hashes = await Promise.all(Array.from({ length: size }, async (_, i) => {
      const n = base + i
      const buf = await crypto.subtle.digest('SHA-256', ALTCHA_ENC.encode(ch.salt + String(n)))
      const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
      return { n, hex }
    }))
    const hit = hashes.find(h => h.hex === ch.challenge)
    if (hit) {
      return btoa(JSON.stringify({ algorithm: ch.algorithm, challenge: ch.challenge, number: hit.n, salt: ch.salt, signature: ch.signature }))
    }
  }
  throw new Error('Rally: ALTCHA challenge unsolvable within maxnumber')
}

// Step 1: get ALTCHA proof-of-work challenge and solve it; step 2: login —
// success is a 302 redirect to /account with Set-Cookie: login={sid}.
// Shared by every entry point that needs an authenticated session, including
// the live-state WebSocket (lib/rallyPace/sync.ts), which needs the cookie
// itself rather than just the parsed games fetchRally returns.
export async function loginRally(username: string, password: string): Promise<string> {
  const chRes = await fetch(`${BASE}/altcha-challenge`)
  const challenge: AltchaChallenge = await chRes.json()
  const altcha = await solveAltcha(challenge)

  const loginRes = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, altcha }),
    redirect: 'manual',
  })
  if (loginRes.status !== 302) throw new Error('Rally the Troops login failed')
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  if (!cookie) throw new Error('Rally the Troops login failed: no session cookie')
  return cookie
}

export async function fetchRallyWithSession(username: string, password: string): Promise<{ cookie: string; games: Game[] }> {
  const cookie = await loginRally(username, password)
  const gamesRes = await fetch(`${BASE}/games/active`, {
    headers: { ...HEADERS, Cookie: cookie },
  })
  if (!gamesRes.ok) throw new Error(`Rally the Troops games fetch failed (HTTP ${gamesRes.status})`)

  const html = await gamesRes.text()
  return { cookie, games: parseGamesActive(html, username) }
}

export async function fetchRally(username: string, password: string): Promise<Game[]> {
  return (await fetchRallyWithSession(username, password)).games
}

// Reverse rally-the-troops's human_date() to get an approximate Date
function parseHumanDate(text: string): Date {
  const now = Date.now()
  let m: RegExpMatchArray | null
  if (text === 'now') return new Date(now)
  if (text === '1 minute ago') return new Date(now - 60_000)
  if ((m = text.match(/^(\d+) minutes? ago$/))) return new Date(now - +m[1] * 60_000)
  if (text === '1 hour ago') return new Date(now - 3_600_000)
  if ((m = text.match(/^(\d+) hours? ago$/))) return new Date(now - +m[1] * 3_600_000)
  if (text === 'yesterday') return new Date(now - 24 * 3_600_000)
  if ((m = text.match(/^(\d+) days? ago$/))) return new Date(now - +m[1] * 86_400_000)
  if ((m = text.match(/^(\d+) weeks? ago$/))) return new Date(now - +m[1] * 7 * 86_400_000)
  const d = new Date(text) // "YYYY-MM-DD"
  return isNaN(d.getTime()) ? new Date(now) : d
}

// Each game_item carries its own "your_turn" class when it needs your move —
// used instead of which <h2> section (heading) it's under, since Rally has
// renamed and added sections over time (the old "Move" heading is gone;
// "Solo" was added for solo-mode games) and per-item class survives that.
function parseSection(section: string, username: string): Game[] {
  const out: Game[] = []
  const chunks = section.split(/(?=<div[^>]+class="[^"]*\bgame_item\b)/)
  for (const chunk of chunks) {
    const gameId = chunk.match(/href="\/join\/(\d+)"/)?.[1]
    if (!gameId) continue

    const classMatch = chunk.match(/class="(game_item[^"]*)"/)
    const myTurn = classMatch ? /\byour_turn\b/.test(classMatch[1]) : false

    const titleMatch = chunk.match(/href="\/join\/\d+"[^>]*>#\d+\s*(?:&#x2013;|[–—-])\s*([^<(]+)/)
    const gameName = titleMatch ? titleMatch[1].trim() : 'Unknown'

    const cmdMatch = chunk.match(/<a[^>]+class="command"[^>]+href="([^"]+)"/)
                ?? chunk.match(/href="([^"]+)"[^>]*>(?:Play|Watch|Review)</)
    const rawUrl = (cmdMatch?.[1] ?? `/join/${gameId}`).replace(/&amp;/g, '&')
    const gameUrl = rawUrl.startsWith('http') ? rawUrl : `${BASE}${rawUrl}`

    // Player names are rendered as <a href="/user/name">name</a>; a solo
    // game lists the same username twice (both "seats"), leaving no one else
    const playersSection = chunk.match(/Players:\s*([\s\S]*?)<\/div>/)?.[1] ?? ''
    const players = [...playersSection.matchAll(/<a[^>]+href="\/user\/[^"]*"[^>]*>([^<]+)<\/a>/g)]
      .map(m => m[1])
      .filter(n => n !== username)

    const lastMoveMatch = chunk.match(/Last move:\s*([^<]+)</)
    const lastMoveAt = lastMoveMatch ? parseHumanDate(lastMoveMatch[1].trim()) : new Date()

    out.push({
      id: `rally:${gameId}`,
      platform: 'rally',
      gameName,
      myTurn,
      currentPlayer: undefined,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl,
      platformUrl: `${BASE}/games/active`,
      players,
    })
  }
  return out
}

function parseGamesActive(html: string, username: string): Game[] {
  // "Recently finished" lists completed games, not active ones — everything
  // before it (whatever sections it's split into) is a live game
  const finishedIdx = html.indexOf('<h2>Recently finished</h2>')
  const relevant = finishedIdx === -1 ? html : html.slice(0, finishedIdx)
  return parseSection(relevant, username)
}

function parseGamesFinished(html: string): FinishedGame[] {
  // /games/finished has no <h2> section headers — game_items appear at the top level
  const games: FinishedGame[] = []
  const chunks = html.split(/(?=<div[^>]+class="[^"]*\bgame_item\b)/)
  for (const chunk of chunks) {
    const gameId = chunk.match(/href="\/join\/(\d+)"/)?.[1]
    if (!gameId) continue

    const titleMatch = chunk.match(/href="\/join\/\d+"[^>]*>#\d+\s*(?:&#x2013;|[–—-])\s*([^<(]+)/)
    const gameName = titleMatch ? titleMatch[1].trim() : 'Unknown'

    const cmdMatch = chunk.match(/<a[^>]+class="command"[^>]+href="([^"]+)"/)
                ?? chunk.match(/href="([^"]+)"[^>]*>(?:Play|Watch|Review)</)
    const rawUrl = (cmdMatch?.[1] ?? `/join/${gameId}`).replace(/&amp;/g, '&')
    const gameUrl = rawUrl.startsWith('http') ? rawUrl : `${BASE}${rawUrl}`

    // Finished games page uses "Finished:" not "Last move:"
    const finishedMatch = chunk.match(/Finished:\s*([^<]+)</)
    const completedAt = finishedMatch ? parseHumanDate(finishedMatch[1].trim()) : new Date()

    games.push({
      id: `rally:${gameId}`,
      platform: 'rally',
      gameName,
      completedAt,
      completedAgo: formatTimeAgo(completedAt),
      gameUrl,
    })
  }
  return games
}

export async function fetchFinishedRally(username: string, password: string): Promise<FinishedGame[]> {
  const chRes = await fetch(`${BASE}/altcha-challenge`)
  const challenge: AltchaChallenge = await chRes.json()
  const altcha = await solveAltcha(challenge)

  const loginRes = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, altcha }),
    redirect: 'manual',
  })
  if (loginRes.status !== 302) throw new Error('Rally the Troops login failed')
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  if (!cookie) throw new Error('Rally the Troops login failed: no session cookie')

  const gamesRes = await fetch(`${BASE}/games/finished`, {
    headers: { ...HEADERS, Cookie: cookie },
  })
  if (!gamesRes.ok) throw new Error(`Rally finished games fetch failed (HTTP ${gamesRes.status})`)

  const html = await gamesRes.text()
  return parseGamesFinished(html)
}
