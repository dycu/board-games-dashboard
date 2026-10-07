import { withBgaSession, fetchBgaTables, bgaApiHeaders, BgaSession } from '../connectors/bga'
import { extractTurns, INITIAL_TURN_STATE, BgaPacket } from './bgaTurns'
import { getMeta, setMeta, getTables, putTables, appendTurns, PaceTable } from './store'

const BASE = 'https://boardgamearena.com'
const BACKFILL_DAYS = 365
// A finished table that lasted less than this was a real-time game; its turns
// say nothing about async pace and it doesn't count toward async load.
export const REALTIME_MAX_SECONDS = 4 * 3600
const CONCURRENCY = 3
const ARCHIVE_GRACE_SECONDS = 6 * 3600

export interface SyncProgress {
  tables: number
  pendingHistory: number
  indexComplete: boolean
  lastSyncAt: number
}

async function getJson(url: string, session: BgaSession): Promise<any> {
  const res = await fetch(url, { headers: bgaApiHeaders(session) })
  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`BGA ${new URL(url).pathname} HTTP ${res.status}: not JSON`)
  }
  if (String(json.status) !== '1') throw new Error(`BGA ${new URL(url).pathname}: ${json.error ?? 'status ' + json.status}`)
  return json.data
}

async function fetchFinishedPage(session: BgaSession, page: number): Promise<any[]> {
  const data = await getJson(
    `${BASE}/gamestats/gamestats/getGames.html?player=${session.myId}&opponent_id=0&finished=1&page=${page}&updateStats=0`,
    session,
  )
  return data?.tables ?? []
}

async function fetchPackets(session: BgaSession, t: PaceTable): Promise<BgaPacket[]> {
  if (t.end === null) {
    if (!t.server) throw new Error('no gameserver for active table')
    // `from` is a packet id; BGA returns a ~200-packet overlap before it, which
    // extractTurns drops by packet id
    const data = await getJson(
      `${BASE}/${t.server}/${t.game}/${t.game}/notificationHistory.html?table=${t.id}&from=${t.state.lastPacketId + 1}&privateinc=1&history=1`,
      session,
    )
    return data?.data ?? []
  }
  // Finished tables are only readable through the replay archive
  const data = await getJson(`${BASE}/archive/archive/logs.html?table=${t.id}&translated=true`, session)
  return data?.logs ?? []
}

export async function syncBga(username: string, password: string, budgetMs: number): Promise<SyncProgress> {
  const deadline = Date.now() + budgetMs
  const timeLeft = () => deadline - Date.now()

  // Listing running tables doubles as the check that the cached session still works
  const { session, active } = await withBgaSession(username, password, async s => ({ session: s, active: await fetchBgaTables(s) }))
  const [meta, tables] = await Promise.all([getMeta(), getTables()])
  const changed = new Set<string>()
  const upsert = (t: PaceTable) => { tables[t.id] = t; changed.add(t.id) }

  // 1. Running tables
  const activeIds = new Set(active.map((t: any) => String(t.id)))
  for (const raw of active) {
    const id = String(raw.id)
    const existing = tables[id]
    if (!existing) {
      upsert({
        id, game: raw.game_name, server: String(raw.gameserver), start: Number(raw.gamestart), end: null,
        history: 'pending', state: INITIAL_TURN_STATE,
      })
    } else if (existing.server !== String(raw.gameserver)) {
      upsert({ ...existing, server: String(raw.gameserver) }) // tables move between game servers
    }
  }

  // 2. Finished tables: backfill back to the horizon once, then only read new pages
  const horizon = Date.now() / 1000 - BACKFILL_DAYS * 86400
  let page = meta.indexComplete ? 1 : meta.nextIndexPage
  let caughtUp = false
  while (timeLeft() > 5000) {
    const rows = await fetchFinishedPage(session, page)
    if (rows.length === 0) { meta.indexComplete = true; caughtUp = true; break }
    let allKnown = true
    let oldest = Infinity
    for (const r of rows) {
      const id = String(r.table_id)
      const start = Number(r.start)
      const end = Number(r.end)
      oldest = Math.min(oldest, start)
      const existing = tables[id]
      if (existing && existing.end !== null) continue
      allKnown = false
      if (r.cancelled === '1' || r.cancelled === 1) continue
      const realtime = end - start < REALTIME_MAX_SECONDS
      // BGA archives a finished table's move log within hours ("Cannot find
      // gamenotifs log file of an archived table"), so the archive is only
      // worth one try right after a game ends. Turns come from reading tables
      // while they run; a table never read while running has none.
      const logMayExist = Date.now() / 1000 - end < ARCHIVE_GRACE_SECONDS
      upsert({
        id, game: r.game_name, server: existing?.server, start, end,
        history: !realtime && logMayExist ? 'pending' : 'done',
        state: existing?.state ?? INITIAL_TURN_STATE,
        realtime,
      })
    }
    if (meta.indexComplete && allKnown) { caughtUp = true; break }
    if (oldest < horizon) { meta.indexComplete = true; caughtUp = true; break }
    page++
    if (!meta.indexComplete) meta.nextIndexPage = page
  }

  // A table that left the running list but never showed up as finished
  // (e.g. abandoned) — close it at its last known activity
  if (caughtUp) {
    for (const t of Object.values(tables)) {
      if (t.end === null && !activeIds.has(t.id)) {
        upsert({ ...t, end: t.state.lastTime || Math.floor(Date.now() / 1000), history: 'pending' })
      }
    }
  }

  // 3. Turn histories: running tables first (cheap, incremental), then finished backlog newest first
  const queue = [
    ...Object.values(tables).filter(t => t.end === null && activeIds.has(t.id)),
    ...Object.values(tables)
      .filter(t => t.end !== null && t.history === 'pending')
      .sort((a, b) => (b.end ?? 0) - (a.end ?? 0)),
  ]
  let next = 0
  async function worker() {
    while (next < queue.length && timeLeft() > 3000) {
      const t = queue[next++]
      try {
        const packets = await fetchPackets(session, t)
        const { turns, state } = extractTurns(packets, session.myId, t.state)
        // A finished game can't still be waiting on me; if the log didn't close
        // my last turn, it ended when the game did
        if (t.end !== null && state.openStart !== null) {
          if (t.end > state.openStart) turns.push([state.openStart, t.end])
          state.openStart = null
        }
        await appendTurns(t.id, turns)
        upsert({ ...t, state, history: t.end === null ? 'synced' : 'done', failures: 0 })
      } catch {
        if (t.end !== null) {
          // Archived already: keep what was read while it ran and close my
          // open turn (if any) at the end of the game
          const state = { ...t.state, openStart: null }
          if (t.state.openStart !== null && t.end > t.state.openStart) await appendTurns(t.id, [[t.state.openStart, t.end]])
          upsert({ ...t, state, history: 'failed' })
        } else {
          upsert({ ...t, failures: (t.failures ?? 0) + 1 })
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  await putTables([...changed].map(id => tables[id]))
  meta.lastSyncAt = Math.floor(Date.now() / 1000)
  await setMeta(meta)

  const all = Object.values(tables)
  return {
    tables: all.length,
    pendingHistory: all.filter(t => t.history === 'pending').length,
    indexComplete: meta.indexComplete,
    lastSyncAt: meta.lastSyncAt,
  }
}
