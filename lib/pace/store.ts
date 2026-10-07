import { kv } from '@vercel/kv'
import { Turn, TurnState } from './bgaTurns'

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
  failures?: number
  realtime?: boolean    // finished within a few hours — a live game, not part of the async load
}

export interface PaceMeta {
  trackingStartedAt: number
  lastSyncAt: number | null
  indexComplete: boolean // all finished tables back to the backfill horizon are indexed
  nextIndexPage: number  // getGames page to resume backfill indexing from
}

export async function getMeta(): Promise<PaceMeta> {
  const meta = await kv.get<PaceMeta>(META_KEY)
  return meta ?? {
    trackingStartedAt: Math.floor(Date.now() / 1000),
    lastSyncAt: null,
    indexComplete: false,
    nextIndexPage: 1,
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
