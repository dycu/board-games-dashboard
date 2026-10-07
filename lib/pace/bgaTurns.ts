// Derives "my turns" from a BGA table's notification packets.
//
// Both notificationHistory.html (active tables) and archive logs.html
// (finished tables) return packets shaped {packet_id, time, data: [...]},
// where `time` is a server-side Unix timestamp in seconds. Who is active is
// announced by two notification types:
//   gameStateChange              args.type 'activeplayer' → args.active_player is the only active player
//                                args.type 'multipleactiveplayer' → active set follows in a
//                                gameStateMultipleActiveUpdate (usually the same packet)
//                                args.type 'game' / 'manager' → automatic states, active player unchanged
//   gameStateMultipleActiveUpdate args = array of active player ids
//
// A turn is a maximal stretch where I'm in the active set, evaluated once per
// packet, so the empty-then-filled set inside a single multiactive packet
// doesn't split a turn. Consecutive actions of mine with automatic states in
// between are one turn.

export interface BgaPacket {
  packet_id: string | number
  time: string | number
  data?: { type: string; args?: any }[]
}

export type Turn = [start: number, end: number] // Unix seconds

export interface TurnState {
  lastPacketId: number    // highest packet already processed
  active: string[]        // active player ids after lastPacketId
  openStart: number | null // start of my turn in progress, if any
  lastTime: number        // time of the latest processed packet
}

export const INITIAL_TURN_STATE: TurnState = { lastPacketId: 0, active: [], openStart: null, lastTime: 0 }

export function extractTurns(
  packets: BgaPacket[],
  myId: string,
  state: TurnState = INITIAL_TURN_STATE,
): { turns: Turn[]; state: TurnState } {
  const turns: Turn[] = []
  let active = new Set(state.active)
  let openStart = state.openStart
  let lastPacketId = state.lastPacketId
  let lastTime = state.lastTime

  const sorted = packets
    .map(p => ({ ...p, id: Number(p.packet_id), t: Number(p.time) }))
    .filter(p => p.id > state.lastPacketId && !isNaN(p.t))
    .sort((a, b) => a.id - b.id)

  for (const p of sorted) {
    for (const n of p.data ?? []) {
      if (n.type === 'gameStateChange') {
        const type = n.args?.type
        if (type === 'activeplayer') active = new Set([String(n.args.active_player)])
        else if (type === 'multipleactiveplayer') active = new Set()
        if (n.args?.name === 'gameEnd') active = new Set()
      } else if (n.type === 'gameStateMultipleActiveUpdate' && Array.isArray(n.args)) {
        active = new Set(n.args.map(String))
      }
    }

    const mine = active.has(myId)
    if (mine && openStart === null) openStart = p.t
    else if (!mine && openStart !== null) {
      turns.push([openStart, p.t])
      openStart = null
    }
    lastPacketId = p.id
    lastTime = p.t
  }

  return { turns, state: { lastPacketId, active: [...active], openStart, lastTime } }
}
