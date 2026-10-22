import { kv } from '@vercel/kv'
import { Game, FinishedGame } from '../types'
import { formatTimeAgo, choochooGameType } from './utils'

const BASE = 'https://boardgamers.space'

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
}

interface BoardgamersPlayer {
  _id: string
  name: string
  dropped: boolean
  quit: boolean
  score?: number
  ranking?: number
  elo?: { delta: number; initial: number }
}

interface BoardgamersCurrentPlayer {
  _id: string
  deadline: string // ISO
}

interface BoardgamersGame {
  _id: string
  players: BoardgamersPlayer[]
  currentPlayers: BoardgamersCurrentPlayer[]
  game: { name: string } // e.g. "gaia-project"
  status: 'open' | 'active' | 'ended'
  lastMove: string // ISO
  endedAt?: string // ISO, status === 'ended' only
  cancelled?: boolean
}

interface BoardgamersSession {
  cookie: string
  userId: string
}

const SESSION_KV_KEY = 'boardgamers-session'
// Session cookie is a long-lived refresh token (the site's own session isn't
// re-validated per request) — a generous TTL keeps this to one login per
// cache window rather than one per dashboard refresh.
const SESSION_TTL_SECONDS = 6 * 3600

async function quietly<T>(op: () => Promise<T>): Promise<T | null> {
  try { return await op() } catch { return null }
}

// The login form posts here and gets back a SvelteKit form-action JSON
// envelope (not a real HTTP redirect) — {"location": "..."} either way;
// an error from bad credentials shows up as a "?error=..." query string on it.
async function loginBoardgamers(email: string, password: string): Promise<BoardgamersSession> {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: {
      ...BROWSER,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE,
      Referer: `${BASE}/login`,
    },
    body: new URLSearchParams({ redirect: '/login', email, password }),
    redirect: 'manual',
  })
  const setCookie = res.headers.get('set-cookie') ?? ''
  // Each Set-Cookie line can itself contain a comma (an expires= date), so
  // split lines only where a new "name=" token follows one
  const cookie = setCookie
    .split(/,(?=\s*[A-Za-z0-9_-]+=)/)
    .map(c => c.split(';')[0].trim())
    .filter(c => c.includes('='))
    .join('; ')

  const bodyText = await res.text().catch(() => '')
  let location = ''
  try { location = (JSON.parse(bodyText) as { location?: string }).location ?? '' } catch { /* not JSON */ }
  if (!cookie || /[?&]error=/.test(location)) {
    const reason = location.match(/[?&]error=([^&]*)/)?.[1]
    throw new Error(`Boardgamers.space login failed${reason ? `: ${decodeURIComponent(reason.replace(/\+/g, ' '))}` : ''}`)
  }

  const accountRes = await fetch(`${BASE}/api/account`, { headers: { ...BROWSER, Cookie: cookie } })
  if (!accountRes.ok) throw new Error(`Boardgamers.space account fetch failed: HTTP ${accountRes.status}`)
  const account = await accountRes.json() as { _id?: string }
  if (!account._id) throw new Error('Boardgamers.space: no user id in account response')

  return { cookie, userId: account._id }
}

// Runs fn with, first, the cached session; a real login only happens when
// there's no cached session or Boardgamers.space rejects it
async function withBoardgamersSession<T>(
  email: string,
  password: string,
  fn: (session: BoardgamersSession) => Promise<T>,
): Promise<T> {
  const cached = await quietly(() => kv.get<BoardgamersSession>(SESSION_KV_KEY))
  if (cached) {
    try {
      return await fn(cached)
    } catch {
      await quietly(() => kv.del(SESSION_KV_KEY))
    }
  }
  const session = await loginBoardgamers(email, password)
  await quietly(() => kv.set(SESSION_KV_KEY, session, { ex: SESSION_TTL_SECONDS }))
  return fn(session)
}

// Unlike most of this site's "status/active"-style endpoints (a public
// sample of activity across the whole site), adding user=<id> scopes the
// result to games that player is actually in — confirmed against a real
// account; doesn't even require the session cookie, but sent anyway since
// other calls on the same session need it
async function fetchGamesByStatus(session: BoardgamersSession, status: 'open' | 'active' | 'ended'): Promise<BoardgamersGame[]> {
  const res = await fetch(`${BASE}/api/game/status/${status}?user=${session.userId}&count=100&skip=0`, {
    headers: { ...BROWSER, Cookie: session.cookie },
  })
  if (!res.ok) throw new Error(`Boardgamers.space ${status} games fetch failed: HTTP ${res.status}`)
  return res.json() as Promise<BoardgamersGame[]>
}

// Reused from choochoo.games' connector — same job (a hyphenated slug like
// "gaia-project" or "primordial-soup" into a display name), not specific to
// that site despite the name
function gameTypeName(slug: string): string {
  return choochooGameType(slug)
}

function playerName(game: BoardgamersGame, id: string): string | undefined {
  return game.players.find(p => p._id === id)?.name
}

function toGame(game: BoardgamersGame, myId: string): Game {
  const myTurn = game.currentPlayers.some(p => p._id === myId)
  const others = game.currentPlayers.filter(p => p._id !== myId)
  const currentPlayer = !myTurn && others.length > 0
    ? others.map(p => playerName(game, p._id) ?? p._id).join(', ')
    : undefined
  const myDeadline = game.currentPlayers.find(p => p._id === myId)?.deadline
  const lastMoveAt = new Date(game.lastMove)
  const gameName = gameTypeName(game.game.name)

  return {
    id: `boardgamers:${game._id}`,
    platform: 'boardgamers',
    gameName,
    gameType: gameName,
    myTurn,
    currentPlayer,
    lastMoveAt,
    lastMoveAgo: formatTimeAgo(lastMoveAt),
    urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
    gameUrl: `${BASE}/game/${game._id}`,
    platformUrl: `${BASE}/?tab=mine`,
    players: game.players.filter(p => p._id !== myId).map(p => p.name),
    ...(myDeadline && { deadlineAt: myDeadline }),
  }
}

export async function fetchBoardgamers(email: string, password: string): Promise<Game[]> {
  return withBoardgamersSession(email, password, async session => {
    const games = await fetchGamesByStatus(session, 'active')
    return games.map(g => toGame(g, session.userId))
  })
}

function toFinishedGame(game: BoardgamersGame, myId: string): FinishedGame {
  const me = game.players.find(p => p._id === myId)
  const completedAt = new Date(game.endedAt ?? game.lastMove)
  const gameName = gameTypeName(game.game.name)
  const tiedForFirst = game.players.filter(p => p.ranking === 1).length
  const result = me?.ranking === undefined ? undefined
    : me.ranking !== 1 ? 'lost' as const
    : tiedForFirst > 1 ? 'draw' as const
    : 'won' as const

  return {
    id: `boardgamers:${game._id}`,
    platform: 'boardgamers',
    gameName,
    gameType: gameName,
    completedAt,
    completedAgo: formatTimeAgo(completedAt),
    gameUrl: `${BASE}/game/${game._id}`,
    ...(result && { result }),
    ...(me?.ranking !== undefined && { rank: me.ranking }),
    playerCount: game.players.length,
    opponents: game.players.filter(p => p._id !== myId).map(p => ({ name: p.name, rank: p.ranking })),
    ...(me?.elo && { elo: me.elo.initial + me.elo.delta, eloDelta: me.elo.delta }),
  }
}

export async function fetchFinishedBoardgamers(email: string, password: string): Promise<FinishedGame[]> {
  return withBoardgamersSession(email, password, async session => {
    const games = await fetchGamesByStatus(session, 'ended')
    return games.filter(g => !g.cancelled).map(g => toFinishedGame(g, session.userId))
  })
}
