import { Game, FinishedGame } from '../types'
import { formatTimeAgo } from './utils'
import { resultFromRanks } from '../results'

const BASE = 'https://18xx.games'

// /api/user returns 404; /api/game/user returns all games visible to the auth'd user.
// Auth via Cookie: auth_token=<value>. myId is resolved by scanning players for username.
function formatCookie(sessionCookie: string): string {
  return sessionCookie.includes('=') ? sessionCookie : `auth_token=${sessionCookie}`
}

function findMyId(games: any[], username: string): number | undefined {
  for (const g of games) {
    const player = (g.players ?? []).find((p: any) => p.name === username)
    if (player) return player.id
  }
  return undefined
}

export async function fetchEighteenXX(username: string, password: string, sessionCookie?: string): Promise<Game[]> {
  let myId: number
  let cookie: string

  if (sessionCookie) {
    cookie = formatCookie(sessionCookie)
    const gamesRes = await fetch(`${BASE}/api/game/user`, {
      headers: { Cookie: cookie, Accept: 'application/json' },
    })
    if (!gamesRes.ok) throw new Error('18xx.games session cookie is invalid or expired — update it in Settings')

    const data = await gamesRes.json()
    const games: any[] = Array.isArray(data) ? data : data.games ?? []

    const resolvedId = findMyId(games, username)
    if (!resolvedId) throw new Error(`18xx.games: player "${username}" not found in any active game — check EIGHTEENXX_USERNAME matches your in-game name`)
    myId = resolvedId

    return games
      .filter((g: any) => g.status === 'active' && (g.players ?? []).some((p: any) => p.id === myId))
      .map((g: any): Game => mapGame(g, myId, username))
  } else {
    const loginRes = await fetch(`${BASE}/api/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: username, password }),
    })
    if (!loginRes.ok) throw new Error('18xx.games login failed')
    const loginData = await loginRes.json()
    myId = loginData.user?.id
    cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''

    const gamesRes = await fetch(`${BASE}/api/game/user`, {
      headers: { Cookie: cookie, Accept: 'application/json' },
    })
    if (!gamesRes.ok) throw new Error('18xx.games games fetch failed')

    const data = await gamesRes.json()
    const games: any[] = Array.isArray(data) ? data : data.games ?? []

    return games
      .filter((g: any) => g.status === 'active' && (g.players ?? []).some((p: any) => p.id === myId))
      .map((g: any): Game => mapGame(g, myId, username))
  }
}

// Finished games come from the public profile page (/profile/<id>): the server
// embeds the player's last 100 games (new, active, finished, archived) in it as
// Opal literals. /api/game/user only has the home page pool, so older finished
// games never show up there.
export async function fetchFinishedEighteenXX(username: string, password: string, sessionCookie?: string): Promise<FinishedGame[]> {
  const myId = await resolveMyId(username, password, sessionCookie)
  const res = await fetch(`${BASE}/profile/${myId}`, { headers: { Accept: 'text/html' } })
  if (!res.ok) throw new Error(`18xx.games profile page failed (${res.status})`)
  return parseProfileGames(await res.text())
    .filter((g: any) => (g.status === 'finished' || g.status === 'archived') && (g.players ?? []).some((p: any) => p.id === myId))
    .map((g: any): FinishedGame => mapFinishedGame(g, myId))
}

async function resolveMyId(username: string, password: string, sessionCookie?: string): Promise<number> {
  const fromEnv = Number(process.env.EIGHTEENXX_USER_ID)
  if (fromEnv > 0) return fromEnv

  if (sessionCookie) {
    const gamesRes = await fetch(`${BASE}/api/game/user`, {
      headers: { Cookie: formatCookie(sessionCookie), Accept: 'application/json' },
    })
    if (!gamesRes.ok) throw new Error('18xx.games session cookie is invalid or expired — update it in Settings')
    const data = await gamesRes.json()
    const games: any[] = Array.isArray(data) ? data : data.games ?? []
    const resolvedId = findMyId(games, username)
    if (!resolvedId) throw new Error(`18xx.games: player "${username}" not found in any game — set EIGHTEENXX_USER_ID`)
    return resolvedId
  }

  const loginRes = await fetch(`${BASE}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: username, password }),
  })
  if (!loginRes.ok) throw new Error('18xx.games login failed')
  const loginData = await loginRes.json()
  const id = Number(loginData.user?.id)
  if (!id) throw new Error('18xx.games login returned no user id')
  return id
}

// The page boots with Opal.App.$attach('app', Opal.hash(..., "games", [...])).
// Opal.hash(k1, v1, k2, v2, ...) is a flat key/value list.
export function parseProfileGames(html: string): any[] {
  const at = html.indexOf('"games",[')
  if (at < 0) throw new Error('18xx.games profile page has no games list')
  const games = new OpalParser(html, at + '"games",'.length).value()
  if (!Array.isArray(games)) throw new Error('18xx.games profile games list is not an array')
  return games
}

class OpalParser {
  constructor(private s: string, private i: number) {}

  value(): any {
    const s = this.s
    if (s.startsWith('Opal.hash(', this.i)) {
      this.i += 'Opal.hash('.length
      const items = this.list(')')
      const obj: Record<string, any> = {}
      for (let k = 0; k + 1 < items.length; k += 2) obj[String(items[k])] = items[k + 1]
      return obj
    }
    if (s[this.i] === '[') {
      this.i++
      return this.list(']')
    }
    if (s[this.i] === '"') {
      let j = this.i + 1
      while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1
      const str = JSON.parse(s.slice(this.i, j + 1))
      this.i = j + 1
      return str
    }
    const m = /^(Opal\.nil|true|false|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/.exec(s.slice(this.i, this.i + 40))
    if (!m) throw new Error(`18xx.games profile: unexpected data at ${this.i}`)
    this.i += m[0].length
    if (m[0] === 'Opal.nil') return null
    if (m[0] === 'true') return true
    if (m[0] === 'false') return false
    return Number(m[0])
  }

  private list(close: string): any[] {
    const out: any[] = []
    while (this.s[this.i] !== close) {
      if (this.i >= this.s.length) throw new Error('18xx.games profile: unterminated data')
      out.push(this.value())
      if (this.s[this.i] === ',') this.i++
    }
    this.i++
    return out
  }
}

function mapGame(g: any, myId: number, username: string): Game {
  // updated_at may be a Unix timestamp (seconds) or an ISO string
  const rawTime = g.updated_at ?? g.created_at
  const lastMoveAt = typeof rawTime === 'number' ? new Date(rawTime * 1000) : new Date(rawTime)
  // API may return acting (array of IDs) or active_players (array of {id, name})
  const activePlayers: any[] = g.active_players ?? []
  const acting: number[] = g.acting ?? activePlayers.map((p: any) => p.id)
  const isMyTurn = acting.includes(myId)
  const currentPlayer = isMyTurn
    ? undefined
    : (g.players ?? []).find((p: any) => acting.includes(p.id) && p.id !== myId)?.name
      ?? activePlayers.find((p: any) => p.id !== myId)?.name

  return {
    id: `eighteenxx:${g.id}`,
    platform: 'eighteenxx',
    gameName: g.title ?? 'Unknown',
    myTurn: isMyTurn,
    currentPlayer,
    lastMoveAt,
    lastMoveAgo: formatTimeAgo(lastMoveAt),
    urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
    gameUrl: `${BASE}/game/${g.id}`,
    platformUrl: BASE,
    players: (g.players ?? [])
      .map((p: any) => p.name)
      .filter((n: string) => n !== username),
  }
}

// result maps player id -> final score; places go by score, ties share a place.
// updated_at moves when a game gets archived, so finished_at comes first.
function mapFinishedGame(g: any, myId: number): FinishedGame {
  const rawTime = g.finished_at ?? g.updated_at ?? g.created_at
  const completedAt = typeof rawTime === 'number' ? new Date(rawTime * 1000) : new Date(rawTime)
  const scores: Record<string, number> = g.result ?? {}
  const players: any[] = g.players ?? []
  const rankOf = (id: number): number | undefined => {
    const score = scores[String(id)]
    return typeof score === 'number' ? 1 + Object.values(scores).filter(s => s > score).length : undefined
  }
  const myRank = rankOf(myId)
  const ranks = players.map((p: any) => rankOf(p.id)).filter((r): r is number => r !== undefined)
  return {
    id: `eighteenxx:${g.id}`,
    platform: 'eighteenxx',
    gameName: g.title ?? 'Unknown',
    completedAt,
    completedAgo: formatTimeAgo(completedAt),
    gameUrl: `${BASE}/game/${g.id}`,
    playerCount: players.length || undefined,
    opponents: players.filter((p: any) => p.id !== myId).map((p: any) => ({ name: String(p.name), rank: rankOf(p.id) })),
    ...(myRank !== undefined && {
      result: resultFromRanks(myRank, ranks),
      rank: myRank,
      score: String(scores[String(myId)]),
    }),
    ...(typeof g.created_at === 'number' && { startedAt: new Date(g.created_at * 1000).toISOString() }),
  }
}
