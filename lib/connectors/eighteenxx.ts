import { Game, FinishedGame } from '../types'
import { formatTimeAgo } from './utils'

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

export async function fetchFinishedEighteenXX(username: string, password: string, sessionCookie?: string): Promise<FinishedGame[]> {
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
    if (!resolvedId) throw new Error(`18xx.games: player "${username}" not found in any game`)
    myId = resolvedId

    return games
      .filter((g: any) => g.status !== 'active' && (g.players ?? []).some((p: any) => p.id === myId))
      .map((g: any): FinishedGame => mapFinishedGame(g))
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
      .filter((g: any) => g.status !== 'active' && (g.players ?? []).some((p: any) => p.id === myId))
      .map((g: any): FinishedGame => mapFinishedGame(g))
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

function mapFinishedGame(g: any): FinishedGame {
  const rawTime = g.updated_at ?? g.created_at
  const completedAt = typeof rawTime === 'number' ? new Date(rawTime * 1000) : new Date(rawTime)
  return {
    id: `eighteenxx:${g.id}`,
    platform: 'eighteenxx',
    gameName: g.title ?? 'Unknown',
    completedAt,
    completedAgo: formatTimeAgo(completedAt),
    gameUrl: `${BASE}/game/${g.id}`,
  }
}
