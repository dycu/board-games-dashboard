import { withBgaSession, fetchBgaTables, bgaApiHeaders, BgaSession } from '../connectors/bga'
import { extractTurns, countTurns, INITIAL_TURN_STATE, BgaPacket } from './bgaTurns'
import { getMeta, setMeta, getTables, putTables, appendTurns, PaceTable } from './store'
import { putHistoryRows, RawBgaRow } from './historyStore'

const BASE = 'https://boardgamearena.com'
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
  pagesRead: number // finished-games pages read this run — for sizing how deep a single run actually gets
  stopReason: 'budget' | 'end-of-history' | 'caught-up'
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
    // extractTurns/countTurns drop by packet id. Resumes from whichever of the
    // two trackers is further behind: totalTurnState starts fresh (lastPacketId
    // 0) on a table the "my turns" tracker already has a head start on, so this
    // re-reads from further back rather than silently skipping everything that
    // happened before whole-game turn counting existed.
    const from = Math.min(t.state.lastPacketId, t.totalTurnState?.lastPacketId ?? 0) + 1
    const data = await getJson(
      `${BASE}/${t.server}/${t.game}/${t.game}/notificationHistory.html?table=${t.id}&from=${from}&privateinc=1&history=1`,
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

  // One-time migration: force a genuine full re-walk (see PaceMeta.fullHistoryMigrated)
  if (!meta.fullHistoryMigrated) {
    meta.indexComplete = false
    meta.nextIndexPage = 1
    meta.fullHistoryMigrated = true
  }

  // 1. Running tables
  const activeIds = new Set(active.map((t: any) => String(t.id)))
  for (const raw of active) {
    const id = String(raw.id)
    const existing = tables[id]
    if (!existing) {
      upsert({
        id, game: raw.game_name, server: String(raw.gameserver), start: Number(raw.gamestart), end: null,
        history: 'pending', state: INITIAL_TURN_STATE,
        playerCount: Object.keys(raw.players ?? {}).length || undefined,
      })
    } else if (existing.server !== String(raw.gameserver)) {
      upsert({ ...existing, server: String(raw.gameserver) }) // tables move between game servers
    }
  }

  // 2. Finished tables: backfill the whole account's history once — all the
  // way to a genuinely empty page, not a time-based cutoff, since the
  // History page's "All time" summary needs the real thing — then keep
  // re-walking from page 1 every run rather than trusting a resume point,
  // since new finishes get prepended to page 1 and push everything else down.
  //
  // While backfilling, this never stops early just because a page happens to
  // be fully known already — for a prolific player across many game types,
  // that's not a safe signal that everything older is known too (a
  // never-seen table can sit a few pages further back, found late or from a
  // run that ran out of budget first). Only once the whole account has
  // genuinely been walked to its end at least once does "every row on this
  // page was already known" become trustworthy: new finishes only ever
  // arrive at page 1, so nothing below an unchanged page could have changed.
  //
  // Pages are read one at a time, not several in parallel — BGA answered a
  // burst of concurrent requests to this endpoint with HTTP 503 during
  // testing, so catching up a large backlog happens gradually over many
  // runs (daily cron, plus whenever the dashboard triggers a sync) rather
  // than all at once.
  let page = meta.indexComplete ? 1 : meta.nextIndexPage
  let caughtUp = false
  let pagesRead = 0
  let stopReason: SyncProgress['stopReason'] = 'budget'
  const historyRows: Record<string, RawBgaRow> = {}
  while (timeLeft() > 5000) {
    const rows = await fetchFinishedPage(session, page)
    pagesRead++
    if (rows.length === 0) { meta.indexComplete = true; caughtUp = true; stopReason = 'end-of-history'; break }
    let allAlreadyKnown = true
    for (const r of rows) {
      const id = String(r.table_id)
      const start = Number(r.start)
      const end = Number(r.end)
      const existing = tables[id]
      const alreadyKnown = !!existing && existing.end !== null
      if (!alreadyKnown) allAlreadyKnown = false
      if (r.cancelled === '1' || r.cancelled === 1) continue
      // Captured regardless of whether the table was already known to pace's
      // own tracking — that only means its turn timing was indexed before,
      // not that its full row (opponents, score, elo) was ever stored here.
      historyRows[id] = r
      if (alreadyKnown) continue
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
        // An active table's turn count so far — carried over, not reset, so a
        // game that finishes outside the archive grace window still keeps
        // whatever was already counted while it ran, instead of losing it
        totalTurnState: existing?.totalTurnState,
        playerCount: String(r.players ?? '').split(',').filter(Boolean).length || existing?.playerCount,
        realtime,
      })
    }
    if (meta.indexComplete && allAlreadyKnown) { caughtUp = true; stopReason = 'caught-up'; break }
    page++
    if (!meta.indexComplete) meta.nextIndexPage = page
  }
  await putHistoryRows(historyRows)

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
        const totalTurnState = countTurns(packets, t.totalTurnState)
        // A finished game can't still be waiting on me; if the log didn't close
        // my last turn, it ended when the game did
        if (t.end !== null && state.openStart !== null) {
          if (t.end > state.openStart) turns.push([state.openStart, t.end])
          state.openStart = null
        }
        await appendTurns(t.id, turns)
        upsert({ ...t, state, totalTurnState, history: t.end === null ? 'synced' : 'done', failures: 0 })
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
    pagesRead,
    stopReason,
  }
}
