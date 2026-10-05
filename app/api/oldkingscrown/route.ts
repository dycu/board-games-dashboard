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
  hand: string[]
}

export interface OkcSnapshot {
  kind: string
  state: {
    turnQueue: string[]
    phase: { kind: string; step: string }
    round: { current: number; total: number }
    table: { players: OkcPlayerState[] }
    regionCardsCommittedBy: string[]
    pendingAbility: { remaining: string[] } | null
    pendingLocationReward: { player: string; stage: string } | null
    pendingDrawOverflow: unknown | null
    pendingHandLimitPlayers: string[]
    loreSpendPlayer: string | null
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

// Mirrors the exact precedence the game's own rules engine uses to decide
// who may act right now — reverse-engineered from oldkingscrown.fly.dev's
// client bundle (the `LK` function and what it dispatches to: `fK`, `pK`,
// `FK`, `wx`), not guessed from observed behavior. Interrupts always outrank
// the normal turnQueue/phase-step flow, highest precedence first:
//   1. pendingDrawOverflow      -> nobody can act; the engine auto-resolves it
//   2. pendingHandLimitPlayers  -> sequential, only the front of the array
//   3. pendingAbility           -> sequential, only remaining[0]
//   4. pendingLocationReward    -> that one player (unless mid-"shuffle-
//                                  necropolis", which also auto-resolves)
//   5. loreSpendPlayer          -> that one player
// Confirmed live: turnQueue=["p0"] simultaneously with
// pendingAbility.remaining=["p1"], and it was genuinely p1's turn to respond
// — i.e. interrupts are checked independently of, and before, turnQueue.
// Only once none of the above apply does the normal phase/turnQueue flow
// run, including the "announce" step of start-of-year: a shared continue
// screen where whoever clicks first advances everyone, so it's everyone's
// turn simultaneously. The remaining start-of-year steps (draw-cards,
// determine-order) use their own non-turnQueue player-selection logic this
// doesn't replicate — rare (once per year) enough that myTurn staying false
// there is an acceptable gap rather than guessed-and-possibly-wrong.
export function isMyTurn(snapshot: OkcSnapshot, mySeatId: string): boolean {
  const { state } = snapshot
  const { turnQueue, phase, table, regionCardsCommittedBy } = state
  const { pendingDrawOverflow, pendingHandLimitPlayers, pendingAbility, pendingLocationReward, loreSpendPlayer } = state

  if (pendingDrawOverflow !== null) return false
  if (pendingHandLimitPlayers.length > 0) return pendingHandLimitPlayers[0] === mySeatId
  if (pendingAbility !== null) return pendingAbility.remaining[0] === mySeatId
  if (pendingLocationReward !== null) {
    if (pendingLocationReward.stage === 'shuffle-necropolis') return false
    return pendingLocationReward.player === mySeatId
  }
  if (loreSpendPlayer !== null) return loreSpendPlayer === mySeatId

  if (phase.kind === 'start-of-year' && phase.step === 'announce') return true

  if (turnQueue.length > 0) return turnQueue[0] === mySeatId
  if (phase.step === 'place-bids') {
    const me = table.players.find(p => p.id === mySeatId)
    return me !== undefined && me.bid === null && me.hand.length > 0
  }
  if (phase.step === 'place-region-cards') {
    return !regionCardsCommittedBy.includes(mySeatId)
  }
  return false
}

function nicknameOf(snapshot: OkcSnapshot, seatId: string): string {
  return snapshot.seats.find(s => s.id === seatId)?.occupants[0]?.nickname ?? seatId
}

// Mirrors isMyTurn's precedence (see its comment) so the two never disagree
// about who's being waited on.
function describeWaitingOn(snapshot: OkcSnapshot, mySeatId: string): string | undefined {
  const { state } = snapshot
  const { turnQueue, phase, table, regionCardsCommittedBy } = state
  const { pendingDrawOverflow, pendingHandLimitPlayers, pendingAbility, pendingLocationReward, loreSpendPlayer } = state

  if (pendingDrawOverflow !== null) return undefined
  if (pendingHandLimitPlayers.length > 0) return nicknameOf(snapshot, pendingHandLimitPlayers[0])
  if (pendingAbility !== null) return nicknameOf(snapshot, pendingAbility.remaining[0])
  if (pendingLocationReward !== null) {
    return pendingLocationReward.stage === 'shuffle-necropolis' ? undefined : nicknameOf(snapshot, pendingLocationReward.player)
  }
  if (loreSpendPlayer !== null) return nicknameOf(snapshot, loreSpendPlayer)

  if (turnQueue.length > 0) return nicknameOf(snapshot, turnQueue[0])
  if (phase.step === 'place-bids') {
    const pending = table.players.filter(p => p.id !== mySeatId && p.bid === null && p.hand.length > 0).map(p => nicknameOf(snapshot, p.id))
    if (pending.length > 0) return pending.join(', ')
  }
  if (phase.step === 'place-region-cards') {
    const pending = table.players.filter(p => p.id !== mySeatId && !regionCardsCommittedBy.includes(p.id)).map(p => nicknameOf(snapshot, p.id))
    if (pending.length > 0) return pending.join(', ')
  }
  return undefined
}

// Per-configured-game status, returned alongside `games` purely so the Setup
// page can show enough to tell games apart and know which are safe to stop
// tracking — there's no account system, so a raw id is otherwise meaningless.
export interface ConfiguredGameStatus {
  gameId: string
  status: 'active' | 'finished' | 'not-member' | 'error'
  players: string[]       // every seated nickname, including me
  game?: Game              // present when status === 'active'
  error?: string           // present when status === 'error'
}

export async function GET() {
  const nickname = (process.env.OLDKINGSCROWN_NICKNAME || 'Dycu').toLowerCase()
  const prefs = await getPrefs()
  const gameIds = prefs.oldkingscrownGameIds ?? []

  if (gameIds.length === 0) return Response.json({ games: [], error: null, configured: [] })

  const configured: ConfiguredGameStatus[] = await Promise.all(gameIds.map(async (gameId): Promise<ConfiguredGameStatus> => {
    try {
      const snapshot = await fetchOkcSnapshot(gameId)
      const players = snapshot.seats.flatMap(s => s.occupants.map(o => o.nickname))
      const mySeat = snapshot.seats.find(s => s.occupants.some(o => o.nickname.toLowerCase() === nickname))
      if (!mySeat) return { gameId, status: 'not-member', players }

      // The site itself reports a finished game via phase.kind === 'game-over'
      // (with final standings attached) — once that happens there's no more
      // "my turn" to track, so drop it from the active list entirely.
      if (snapshot.state.phase.kind === 'game-over') return { gameId, status: 'finished', players }

      const myTurn = isMyTurn(snapshot, mySeat.id)
      const others = snapshot.seats.filter(s => s.id !== mySeat.id).flatMap(s => s.occupants.map(o => o.nickname))

      // The snapshot carries no wall-clock timestamps at all (this game tracks
      // state by revision number, not by time), so there's no real "time since
      // last move" to report — always "just now", never urgent.
      const game: Game = {
        id: `oldkingscrown:${gameId}`,
        platform: 'oldkingscrown',
        gameName: "The Old King's Crown",
        myTurn,
        currentPlayer: myTurn ? undefined : describeWaitingOn(snapshot, mySeat.id),
        lastMoveAt: new Date(),
        lastMoveAgo: 'just now',
        urgent: false,
        gameUrl: `${UI_BASE}/game/${gameId}`,
        platformUrl: UI_BASE,
        players: others,
      }
      return { gameId, status: 'active', players, game }
    } catch (e) {
      return { gameId, status: 'error', players: [], error: e instanceof Error ? e.message : String(e) }
    }
  }))

  const games = configured
    .filter((c): c is ConfiguredGameStatus & { game: Game } => c.status === 'active' && c.game !== undefined)
    .map(c => c.game)

  // A single stale/removed game id shouldn't take down the whole platform —
  // only surface an error when every configured game failed to load.
  const failures = configured.filter(c => c.status === 'error')
  const error = games.length === 0 && failures.length === gameIds.length
    ? (failures[0]?.error ?? 'all configured games failed to load')
    : null

  return Response.json({ games, error, configured })
}
