import { Game, FinishedGame } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://rally-the-troops.com'

const HEADERS = {
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

async function solveAltcha(ch: AltchaChallenge): Promise<string> {
  for (let n = 0; n <= ch.maxnumber; n++) {
    const buf = await crypto.subtle.digest('SHA-256', ALTCHA_ENC.encode(ch.salt + String(n)))
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    if (hex === ch.challenge) {
      return btoa(JSON.stringify({ algorithm: ch.algorithm, challenge: ch.challenge, number: n, salt: ch.salt, signature: ch.signature }))
    }
  }
  throw new Error('Rally: ALTCHA challenge unsolvable within maxnumber')
}

export async function fetchRally(username: string, password: string): Promise<Game[]> {
  // Step 1: get ALTCHA proof-of-work challenge and solve it synchronously
  const chRes = await fetch(`${BASE}/altcha-challenge`)
  const challenge: AltchaChallenge = await chRes.json()
  const altcha = await solveAltcha(challenge)

  // Step 2: login — success is a 302 redirect to /account with Set-Cookie: login={sid}
  const loginRes = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, altcha }),
    redirect: 'manual',
  })
  if (loginRes.status !== 302) throw new Error('Rally the Troops login failed')
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  if (!cookie) throw new Error('Rally the Troops login failed: no session cookie')

  // Step 3: fetch active games page (HTML)
  const gamesRes = await fetch(`${BASE}/games/active`, {
    headers: { ...HEADERS, Cookie: cookie },
  })
  if (!gamesRes.ok) throw new Error(`Rally the Troops games fetch failed (HTTP ${gamesRes.status})`)

  const html = await gamesRes.text()
  return parseGamesActive(html, username)
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

function extractSection(html: string, label: string): string {
  const start = html.indexOf(`<h2>${label}</h2>`)
  if (start === -1) return ''
  const next = html.indexOf('<h2>', start + 5)
  return next === -1 ? html.slice(start) : html.slice(start, next)
}

function parseSection(section: string, myTurn: boolean, username: string, out: Game[]): void {
  const chunks = section.split(/(?=<div[^>]+class="[^"]*\bgame_item\b)/)
  for (const chunk of chunks) {
    const gameId = chunk.match(/href="\/join\/(\d+)"/)?.[1]
    if (!gameId) continue

    const titleMatch = chunk.match(/href="\/join\/\d+"[^>]*>#\d+\s*(?:&#x2013;|[–—-])\s*([^<(]+)/)
    const gameName = titleMatch ? titleMatch[1].trim() : 'Unknown'

    const cmdMatch = chunk.match(/<a[^>]+class="command"[^>]+href="([^"]+)"/)
                ?? chunk.match(/href="([^"]+)"[^>]*>(?:Play|Watch|Review)</)
    const rawUrl = (cmdMatch?.[1] ?? `/join/${gameId}`).replace(/&amp;/g, '&')
    const gameUrl = rawUrl.startsWith('http') ? rawUrl : `${BASE}${rawUrl}`

    // Player names are rendered as <a href="/user/name">name</a>
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
}

function parseGamesActive(html: string, username: string): Game[] {
  const games: Game[] = []
  parseSection(extractSection(html, 'Move'), true, username, games)
  parseSection(extractSection(html, 'Active'), false, username, games)
  return games
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
