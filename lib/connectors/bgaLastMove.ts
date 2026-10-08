import { kv } from '@vercel/kv'
import { BgaPacket } from '../pace/bgaTurns'

// BGA's table list has no last-move time, and a table's full notification
// history can be several MB. But the list does say who is active, so a
// table's history is read only when that changes, and only from the last
// packet already seen. "Last move" = when the current active player(s) took over.

const CACHE_KEY = 'bga-lastmove:v1'

export interface LastMoveEntry {
  active: string    // activeKey() when `since` was worked out
  since: number     // Unix seconds the active set last changed
  packetId: number  // highest packet read
  activeIds: string[] // active set after packetId, per the packets
}

export type LastMoveCache = Record<string, LastMoveEntry>

export function activeKey(players: Record<string, { myturn?: string | number }>): string {
  return Object.entries(players)
    .filter(([, p]) => p.myturn === '1' || p.myturn === 1)
    .map(([id]) => id)
    .sort()
    .join(',')
}

// Replays packets after `fromPacket` and returns when the active set last
// changed. A multiactive state empties the set and refills it within one packet,
// so the set is compared once per packet.
export function lastActiveChange(
  packets: BgaPacket[],
  fromPacket: number,
  startActive: string[],
): { changedAt: number | null; activeIds: string[]; packetId: number; lastTime: number | null } {
  let active = new Set(startActive)
  let changedAt: number | null = null
  let packetId = fromPacket
  let lastTime: number | null = null
  const sorted = packets
    .map(p => ({ ...p, id: Number(p.packet_id), t: Number(p.time) }))
    .filter(p => p.id > fromPacket && !isNaN(p.t))
    .sort((a, b) => a.id - b.id)

  for (const p of sorted) {
    const before = [...active].sort().join(',')
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
    if ([...active].sort().join(',') !== before) changedAt = p.t
    packetId = p.id
    lastTime = p.t
  }
  return { changedAt, activeIds: [...active], packetId, lastTime }
}

export interface TableRef {
  id: string
  gameserver: string
  game_name: string
  players: Record<string, { myturn?: string | number }>
}

export interface Seed { lastPacketId: number; active: string[]; lastTime: number }

// Returns table id → Unix seconds of the last move, for the tables it could work out
export async function resolveLastMoves(
  tables: TableRef[],
  fetchPackets: (t: TableRef, from: number) => Promise<BgaPacket[]>,
  seeds: Record<string, Seed>, // the Pace sync's per-table state, to avoid reading histories from the start
  options: { concurrency?: number; now?: number } = {},
): Promise<Map<string, number>> {
  const now = options.now ?? Math.floor(Date.now() / 1000)
  const cache = (await kv.get<LastMoveCache>(CACHE_KEY).catch(() => null)) ?? {}
  const next: LastMoveCache = {}
  const out = new Map<string, number>()

  const stale = tables.filter(t => {
    const hit = cache[t.id]
    if (hit && hit.active === activeKey(t.players)) {
      next[t.id] = hit
      out.set(t.id, hit.since)
      return false
    }
    return true
  })

  let i = 0
  const worker = async () => {
    while (i < stale.length) {
      const t = stale[i++]
      const key = activeKey(t.players)
      const known = cache[t.id] ?? (seeds[t.id] ? {
        active: '', since: seeds[t.id].lastTime, packetId: seeds[t.id].lastPacketId, activeIds: seeds[t.id].active,
      } : null)
      try {
        const from = known?.packetId ?? 0
        const r = lastActiveChange(await fetchPackets(t, from + 1), from, known?.activeIds ?? [])
        // No change among the new packets → it happened before them (rare: the
        // list's active flags lag the history); the newest packet is the best guess
        const since = r.changedAt ?? r.lastTime ?? known?.since ?? now
        next[t.id] = { active: key, since, packetId: r.packetId, activeIds: r.activeIds }
        out.set(t.id, since)
      } catch {
        // Leave this table to the old estimate; retried on the next refresh
      }
    }
  }
  await Promise.all(Array.from({ length: options.concurrency ?? 4 }, worker))

  // Only current tables are kept, so finished ones drop out
  await kv.set(CACHE_KEY, next).catch(() => {})
  return out
}
