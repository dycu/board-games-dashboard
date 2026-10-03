import { Game } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://oldkingscrown.fly.dev'

interface OkcLobbyMember {
  nickname: string
  seat: number
  ready: boolean
  isHost: boolean
}

interface OkcLobbySummary {
  id: string
  name: string
  status: string
  seats: number
  memberCount: number
  updatedAt: string
}

interface OkcLobbyDetail extends OkcLobbySummary {
  members: OkcLobbyMember[]
}

// There are no accounts on this site — players are known only by a nickname
// typed into their own browser each visit, and the only public listing is
// /api/lobbies, which covers pre-game lobbies still "waiting" for players.
// Once a lobby's game actually starts, it drops off that listing and its
// state only lives behind a WebSocket keyed by a game id nobody outside that
// browser knows — so there's no way to track whose turn it is mid-game here,
// only whether "my" lobby is still waiting on seats or on someone to ready up.
export async function fetchOldKingsCrown(nickname: string): Promise<Game[]> {
  const listRes = await fetch(`${BASE}/api/lobbies`, { headers: { Accept: 'application/json' } })
  if (!listRes.ok) throw new Error(`Old King's Crown lobbies fetch failed: HTTP ${listRes.status}`)
  const { lobbies } = await listRes.json() as { lobbies: OkcLobbySummary[] }

  const waiting = lobbies.filter(l => l.status === 'waiting').slice(0, 100)

  const details = await Promise.all(
    waiting.map(async (l): Promise<OkcLobbyDetail | null> => {
      const res = await fetch(`${BASE}/api/lobbies/${l.id}`, { headers: { Accept: 'application/json' } })
      if (!res.ok) return null
      const { lobby } = await res.json() as { lobby: OkcLobbyDetail }
      return lobby
    })
  )

  const nick = nickname.toLowerCase()
  const myLobbies = details.filter((l): l is OkcLobbyDetail =>
    l !== null && l.members.some(m => m.nickname.toLowerCase() === nick)
  )

  return myLobbies.map((lobby): Game => {
    const me = lobby.members.find(m => m.nickname.toLowerCase() === nick)!
    const others = lobby.members.filter(m => m !== me)
    const seatsOpen = lobby.seats - lobby.memberCount
    const full = seatsOpen <= 0
    const othersNotReady = others.filter(m => !m.ready)

    // Nothing to ready up for until all seats are filled; once full, it's on
    // me if I haven't readied up yet, otherwise I'm waiting on whoever has.
    const isMyTurn = full && !me.ready
    const currentPlayer = isMyTurn
      ? undefined
      : !full
        ? `${seatsOpen} more player${seatsOpen === 1 ? '' : 's'}`
        : othersNotReady.length > 0
          ? othersNotReady.map(m => m.nickname).join(', ')
          : undefined

    const lastMoveAt = new Date(lobby.updatedAt)

    return {
      id: `oldkingscrown:${lobby.id}`,
      platform: 'oldkingscrown',
      gameName: lobby.name,
      myTurn: isMyTurn,
      currentPlayer,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl: `${BASE}/lobby/${lobby.id}`,
      platformUrl: BASE,
      players: others.map(m => m.nickname),
    }
  })
}
