import { kv } from '@vercel/kv'
import { Game, FinishedGame } from '../types'
import { formatTimeAgo, choochooGameType } from './utils'

const BASE = 'https://boardtogether.games'
const API = `${BASE}/api/v1`

interface BoardtogetherPlayer {
  id: string
  userId?: string // absent for a bot/placeholder seat
  name: string
  isHuman: boolean
  // Confirmed from the client bundle's own DL status enum: 'open' (an empty,
  // unfilled seat — present in `players` from the moment the table is
  // created, well before anyone sits there), 'reserved' (a name set aside
  // for someone who hasn't joined yet), 'joined' (an actual player), and
  // 'declined'. So `players.length` on its own counts every seat the table
  // was created with, not how many people have actually joined — only
  // 'joined' entries are real.
  status: string
}

interface BoardtogetherGame {
  id: string
  typeId: string // catalog id, e.g. "indonesia" — see fetchCatalog()
  name: string // the table's own title, player-set (not the game type)
  players: BoardtogetherPlayer[]
  status: string // "started" for the ones this cares about
  activePlayerIds: string[] // whose turn — can be more than one (simultaneous-action games)
  lastActionPlayerId?: string
  lastActionAt?: string // ISO
  updatedAt: string // ISO
  createdAt: string // ISO
  winningPlayerIds?: string[] // finished games only
}

interface BoardtogetherSession {
  cookie: string
  userId: string
}

const SESSION_KV_KEY = 'boardtogether-session'
// The session cookie is a 30-day token (Max-Age=2592000 on login) — not
// re-validated per request, so a generous TTL keeps this to one login per
// cache window rather than one per dashboard refresh.
const SESSION_TTL_SECONDS = 6 * 3600

async function quietly<T>(op: () => Promise<T>): Promise<T | null> {
  try { return await op() } catch { return null }
}

// The login field is labelled "Username" and genuinely means the account's
// username (e.g. "Dycu"), not its email — confirmed against a real account;
// the email the site also has on file is rejected here.
async function loginBoardtogether(username: string, password: string): Promise<BoardtogetherSession> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const setCookie = res.headers.get('set-cookie') ?? ''
  const cookie = setCookie.split(';')[0]
  if (!res.ok || !cookie.startsWith('__session=')) {
    throw new Error(`Boardtogether.games login failed: HTTP ${res.status}`)
  }
  const json = await res.json() as { payload?: { user?: { id?: string } } }
  const userId = json.payload?.user?.id
  if (!userId) throw new Error('Boardtogether.games: no user id in login response')
  return { cookie, userId }
}

// Runs fn with, first, the cached session; a real login only happens when
// there's no cached session or Boardtogether.games rejects it
async function withBoardtogetherSession<T>(
  username: string,
  password: string,
  fn: (session: BoardtogetherSession) => Promise<T>,
): Promise<T> {
  const cached = await quietly(() => kv.get<BoardtogetherSession>(SESSION_KV_KEY))
  if (cached) {
    try {
      return await fn(cached)
    } catch {
      await quietly(() => kv.del(SESSION_KV_KEY))
    }
  }
  const session = await loginBoardtogether(username, password)
  await quietly(() => kv.set(SESSION_KV_KEY, session, { ex: SESSION_TTL_SECONDS }))
  return fn(session)
}

async function fetchJson<T>(path: string, session?: BoardtogetherSession): Promise<T> {
  const res = await fetch(`${API}${path}`, session ? { headers: { Cookie: session.cookie } } : undefined)
  if (!res.ok) throw new Error(`Boardtogether.games ${path} fetch failed: HTTP ${res.status}`)
  const json = await res.json() as { payload: T }
  return json.payload
}

// Public, no session needed — the catalog id ("indonesia") isn't a display
// name on its own (it doesn't even always match the slugified title, e.g.
// "the-old-prince" -> "The Old Prince 1871"), so this is the only reliable
// source for it. Failing quietly and falling back to a humanized id below
// means one bad fetch doesn't take out every game's name.
async function fetchCatalogNames(): Promise<Map<string, string>> {
  const catalog = await quietly(() => fetchJson<{ id: string; metadata: { name: string } }[]>('/catalog'))
  return new Map((catalog ?? []).map(g => [g.id, g.metadata.name]))
}

function gameTypeName(typeId: string, catalogNames: Map<string, string>): string {
  return catalogNames.get(typeId) ?? choochooGameType(typeId)
}

// `game.name` is a free-text table title the creator typed in — often a
// description or announcement ("1830 is here!", "Game 04 - Asynchronous")
// rather than anything naming the actual game, which is unhelpful on its
// own. Lead with the real game type and append the custom title only when
// it says something beyond that (same pattern as the OBG connector).
function buildGameName(customTitle: string, gameType: string): string {
  const title = customTitle.trim()
  if (!title || title === gameType) return gameType
  return `${gameType} — ${title}`
}

function myPlayer(game: BoardtogetherGame, myUserId: string): BoardtogetherPlayer | undefined {
  return game.players.find(p => p.userId === myUserId)
}

function toGame(game: BoardtogetherGame, myUserId: string, catalogNames: Map<string, string>): Game {
  const me = myPlayer(game, myUserId)
  const myTurn = !!me && game.activePlayerIds.includes(me.id)
  const currentPlayer = !myTurn && game.activePlayerIds.length > 0
    ? game.activePlayerIds.map(id => game.players.find(p => p.id === id)?.name ?? id).join(', ')
    : undefined
  const lastMoveAt = new Date(game.lastActionAt ?? game.updatedAt)
  const gameType = gameTypeName(game.typeId, catalogNames)

  return {
    id: `boardtogether:${game.id}`,
    platform: 'boardtogether',
    gameName: buildGameName(game.name, gameType),
    gameType,
    myTurn,
    currentPlayer,
    lastMoveAt,
    lastMoveAgo: formatTimeAgo(lastMoveAt),
    urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
    gameUrl: `${BASE}/game/${game.id}`,
    platformUrl: `${BASE}/`,
    players: game.players.filter(p => p.userId !== myUserId).map(p => p.name),
  }
}

// A table created but not yet started. BoardTogether's own status enum (its
// client bundle's Tz: WaitingForPlayers/WaitingToStart/Started/Finished/
// Deleted/Archived) actually splits "not started" into two: still short on
// seats ('waitingForPlayers') vs. full but the host hasn't hit start yet
// ('waitingToStart') — both are a lobby to forget about just the same, so
// both are treated as pending here rather than only the latter (an earlier
// version of this connector only matched 'waitingToStart', confirmed missing
// a real waitingForPlayers game).
function toPendingGame(game: BoardtogetherGame, myUserId: string, catalogNames: Map<string, string>): Game {
  const gameType = gameTypeName(game.typeId, catalogNames)
  const lastMoveAt = new Date(game.updatedAt)
  // Empty ('open') and reserved-but-unfilled seats are in `players` from the
  // moment the table is created — only 'joined' ones are real people.
  const joined = game.players.filter(p => p.status === 'joined')
  const others = joined.filter(p => p.userId !== myUserId)

  return {
    id: `boardtogether:${game.id}`,
    platform: 'boardtogether',
    gameName: buildGameName(game.name, gameType),
    gameType,
    myTurn: false,
    pending: true,
    currentPlayer: `${joined.length} joined — waiting to start`,
    lastMoveAt,
    lastMoveAgo: formatTimeAgo(lastMoveAt),
    urgent: false,
    gameUrl: `${BASE}/game/${game.id}`,
    platformUrl: `${BASE}/`,
    players: others.map(p => p.name),
  }
}

export async function fetchBoardtogether(username: string, password: string): Promise<Game[]> {
  return withBoardtogetherSession(username, password, async session => {
    const [{ games }, catalogNames] = await Promise.all([
      fetchJson<{ games: BoardtogetherGame[] }>('/games/mine', session),
      fetchCatalogNames(),
    ])
    return [
      ...games.filter(g => g.status === 'started').map(g => toGame(g, session.userId, catalogNames)),
      ...games.filter(g => g.status === 'waitingForPlayers' || g.status === 'waitingToStart').map(g => toPendingGame(g, session.userId, catalogNames)),
    ]
  })
}

function toFinishedGame(game: BoardtogetherGame, myUserId: string, catalogNames: Map<string, string>): FinishedGame {
  const me = myPlayer(game, myUserId)
  const winners = game.winningPlayerIds ?? []
  const completedAt = new Date(game.updatedAt)
  const gameType = gameTypeName(game.typeId, catalogNames)
  const result = !me ? undefined
    : !winners.includes(me.id) ? 'lost' as const
    : winners.length > 1 ? 'draw' as const
    : 'won' as const

  return {
    id: `boardtogether:${game.id}`,
    platform: 'boardtogether',
    gameName: buildGameName(game.name, gameType),
    gameType,
    completedAt,
    completedAgo: formatTimeAgo(completedAt),
    gameUrl: `${BASE}/game/${game.id}`,
    ...(result && { result }),
    playerCount: game.players.length,
    opponents: game.players.filter(p => p.userId !== myUserId).map(p => ({ name: p.name })),
  }
}

export async function fetchFinishedBoardtogether(username: string, password: string): Promise<FinishedGame[]> {
  return withBoardtogetherSession(username, password, async session => {
    const [{ games }, catalogNames] = await Promise.all([
      fetchJson<{ games: BoardtogetherGame[] }>('/games/history', session),
      fetchCatalogNames(),
    ])
    return games.map(g => toFinishedGame(g, session.userId, catalogNames))
  })
}
