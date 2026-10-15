import { kv } from '@vercel/kv'
import { Turn, TurnState, TotalTurnState } from './bgaTurns'

const PREFIX = 'pace:v1:'
const TABLES_KEY = `${PREFIX}bga:tables`
const META_KEY = `${PREFIX}meta`
const turnsKey = (id: string) => `${PREFIX}bga:turns:${id}`

export interface PaceTable {
  id: string
  game: string          // BGA slug, e.g. "thecrew"
  server?: string       // gameserver number, needed for notificationHistory on active tables
  start: number         // Unix seconds
  end: number | null    // null while running
  history: 'pending' | 'synced' | 'done' | 'failed'
  // 'synced' = active table, incrementally up to date; 'done' = finished and fully read
  state: TurnState
  // Whole-game turn count (any player), for the "how far along is this game"
  // estimate — undefined for tables synced before this was tracked
  totalTurnState?: TotalTurnState
  playerCount?: number  // for comparing a game's turn count only against others with the same number of players
  failures?: number
  realtime?: boolean    // finished within a few hours — a live game, not part of the async load
}

export interface PaceMeta {
  trackingStartedAt: number
  lastSyncAt: number | null
  indexComplete: boolean // the whole account's finished-table history has been walked once, to a genuinely empty page
  nextIndexPage: number  // getGames page to resume backfill indexing from
  // One-time flag: true once indexComplete's meaning has been migrated from
  // "reached the old time-based backfill horizon" to "reached a genuinely
  // empty page" (see lib/pace/sync.ts). Meta stored before that change won't
  // have this field, so it reads as false/undefined and triggers exactly one
  // full re-walk from page 1 — needed both because the old indexComplete
  // could be stale-true without ever having reached a real end, and because
  // lib/pace/historyStore didn't exist yet, so nothing in it was ever
  // backfilled for tables this account already knew about.
  fullHistoryMigrated?: boolean
}

export async function getMeta(): Promise<PaceMeta> {
  const meta = await kv.get<PaceMeta>(META_KEY)
  return meta ?? {
    trackingStartedAt: Math.floor(Date.now() / 1000),
    lastSyncAt: null,
    indexComplete: false,
    nextIndexPage: 1,
    fullHistoryMigrated: true, // a brand-new account has nothing to migrate
  }
}

export async function setMeta(meta: PaceMeta): Promise<void> {
  await kv.set(META_KEY, meta)
}

export async function getTables(): Promise<Record<string, PaceTable>> {
  return (await kv.hgetall<Record<string, PaceTable>>(TABLES_KEY)) ?? {}
}

export async function putTables(tables: PaceTable[]): Promise<void> {
  if (tables.length === 0) return
  await kv.hset(TABLES_KEY, Object.fromEntries(tables.map(t => [t.id, t])))
}

export async function appendTurns(id: string, turns: Turn[]): Promise<void> {
  if (turns.length === 0) return
  const existing = (await kv.get<Turn[]>(turnsKey(id))) ?? []
  // Guards against re-appending if a previous sync saved turns but not the table state
  const lastEnd = existing.length > 0 ? existing[existing.length - 1][1] : -Infinity
  const fresh = turns.filter(([start]) => start >= lastEnd)
  if (fresh.length === 0) return
  await kv.set(turnsKey(id), [...existing, ...fresh])
}

export async function getAllTurns(ids: string[]): Promise<Record<string, Turn[]>> {
  const out: Record<string, Turn[]> = {}
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const values = await kv.mget<(Turn[] | null)[]>(...chunk.map(turnsKey))
    chunk.forEach((id, j) => { out[id] = values[j] ?? [] })
  }
  return out
}
