import WebSocket from 'ws'
import type { Game } from '@/lib/types'
import { getPrefs } from '@/lib/prefs'

// Needs a real WebSocket client (the 'ws' package) to spectate a running
// game, which can't run in the edge runtime /api/games and /api/test-connection
// use — so this route exists purely as the Node.js proxy target for both.
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const WS_BASE = 'wss://oldkingscrown.fly.dev'
const UI_BASE = 'https://oldkingscrown.fly.dev'
const SNAPSHOT_TIMEOUT_MS = 10000

interface OkcOccupant {
  nickname: string
}

interface OkcSeat {
  id: string
  occupants: OkcOccupant[]
}

interface OkcPlayerState {
  id: string
  bid: string | null
}

export interface OkcSnapshot {
  kind: string
  state: {
    turnQueue: string[]
    phase: { kind: string; step: string }
    round: { current: number; total: number }
    table: { players: OkcPlayerState[] }
  }
  seats: OkcSeat[]
}

// There are no accounts on this site — the only way to watch a game's state
// is to connect as a spectator. The server replies with a "seats" message
// first; a spectator.join reply is required before it sends the actual
// "snapshot" (full game state). See oldkingscrown.fly.dev's own client:
// it does the same handshake when a browser opens a game it isn't seated in.
export function fetchOkcSnapshot(gameId: string): Promise<OkcSnapshot> {
  return new Promise((resolve, reject) => {
    const browserId = crypto.randomUUID()
    const ws = new WebSocket(`${WS_BASE}/api/games/${gameId}?browserId=${browserId}`)

    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error(`timed out waiting for a snapshot of game ${gameId}`))
    }, SNAPSHOT_TIMEOUT_MS)

    const finish = (err: Error | null, snapshot?: OkcSnapshot) => {
      clearTimeout(timer)
      ws.removeAllListeners()
      ws.close()
      if (err) reject(err)
      else resolve(snapshot as OkcSnapshot)
    }

    ws.on('message', (data) => {
      let msg: any
      try { msg = JSON.parse(data.toString()) } catch { return }
      if (msg.kind === 'seats') {
        ws.send(JSON.stringify({ kind: 'spectator.join' }))
      } else if (msg.kind === 'snapshot') {
        finish(null, msg)
      } else if (msg.kind === 'error') {
        finish(new Error(msg.message ?? `game ${gameId} rejected the spectator request`))
      }
    })
    ws.on('error', (err) => finish(err))
    ws.on('close', () => finish(new Error(`game ${gameId} closed the connection before sending a snapshot`)))
  })
}

// The bidding phase is the only simultaneous (non-turnQueue) phase this
// recognizes. Other simultaneous phases this game has (day reactions, region
// card staging, hand-limit discards, etc. — all visible as separate pending-
// player arrays in the snapshot) aren't handled yet: there's no documentation
// of this game's rules engine to generalize from safely, so myTurn stays
// false during those rather than risk a wrong answer.
export function isMyTurn(snapshot: OkcSnapshot, mySeatId: string): boolean {
  const { turnQueue, phase, table } = snapshot.state
  if (turnQueue.length > 0) return turnQueue[0] === mySeatId
  if (phase.step === 'place-bids') {
    return table.players.find(p => p.id === mySeatId)?.bid === null
  }
  return false
}

function nicknameOf(snapshot: OkcSnapshot, seatId: string): string {
  return snapshot.seats.find(s => s.id === seatId)?.occupants[0]?.nickname ?? seatId
}

function describeWaitingOn(snapshot: OkcSnapshot, mySeatId: string): string | undefined {
  const { turnQueue, phase, table } = snapshot.state
  if (turnQueue.length > 0) return nicknameOf(snapshot, turnQueue[0])
  if (phase.step === 'place-bids') {
    const pending = table.players.filter(p => p.id !== mySeatId && p.bid === null).map(p => nicknameOf(snapshot, p.id))
    if (pending.length > 0) return pending.join(', ')
  }
  return undefined
}

export async function GET() {
  const nickname = (process.env.OLDKINGSCROWN_NICKNAME || 'Dycu').toLowerCase()
  const prefs = await getPrefs()
  const gameIds = prefs.oldkingscrownGameIds ?? []

  if (gameIds.length === 0) return Response.json({ games: [], error: null })

  const results = await Promise.allSettled(gameIds.map(async (gameId): Promise<Game | null> => {
    const snapshot = await fetchOkcSnapshot(gameId)
    const mySeat = snapshot.seats.find(s => s.occupants.some(o => o.nickname.toLowerCase() === nickname))
    if (!mySeat) return null

    const myTurn = isMyTurn(snapshot, mySeat.id)
    const others = snapshot.seats.filter(s => s.id !== mySeat.id).flatMap(s => s.occupants.map(o => o.nickname))

    // The snapshot carries no wall-clock timestamps at all (this game tracks
    // state by revision number, not by time), so there's no real "time since
    // last move" to report — always "just now", never urgent.
    const lastMoveAt = new Date()

    return {
      id: `oldkingscrown:${gameId}`,
      platform: 'oldkingscrown',
      gameName: "The Old King's Crown",
      myTurn,
      currentPlayer: myTurn ? undefined : describeWaitingOn(snapshot, mySeat.id),
      lastMoveAt,
      lastMoveAgo: 'just now',
      urgent: false,
      gameUrl: `${UI_BASE}/game/${gameId}`,
      platformUrl: UI_BASE,
      players: others,
    }
  }))

  const games = results
    .filter((r): r is PromiseFulfilledResult<Game | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((g): g is Game => g !== null)

  // A single stale/removed game id shouldn't take down the whole platform —
  // only surface an error when every configured game failed to load.
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  const error = games.length === 0 && failures.length === gameIds.length
    ? (failures[0]?.reason?.message ?? 'all configured games failed to load')
    : null

  return Response.json({ games, error })
}
