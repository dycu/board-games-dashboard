import { Game, Platform } from '../types'
import { getMoveCounts, putMoveCounts, deleteMoveCounts, addToMoveCountHistory, MoveCountEntry } from './store'

// Single-user app, computed server-side with no viewer to read a timezone
// from — "today" means Europe/Warsaw's calendar day, not whichever
// timezone a particular request happens to come from.
const TIME_ZONE = 'Europe/Warsaw'
const DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

// The "day" runs 5am-5am Europe/Warsaw, not midnight-midnight — a session
// that runs past midnight (common enough) would otherwise have its count
// reset to 0 mid-session, making "today's moves" meaningless right when it
// matters. Shifting the instant back before formatting, rather than
// special-casing the formatted date string, keeps this correct across a
// DST transition (the shift is in real elapsed time, not wall-clock hours).
const DAY_BOUNDARY_HOURS = 5

export function todayKey(now = new Date()): string {
  return DAY_FORMATTER.format(new Date(now.getTime() - DAY_BOUNDARY_HOURS * 3600_000))
}

// Compares this fetch's myTurn against what was last observed to detect a
// move actually landing (true -> false): the only transition that means *I*
// acted, as opposed to an opponent's move bringing the turn back to me
// (false -> true). Counting this way instead of via the dashboard's own
// open/return flow (lib/dismissal.ts) makes it exact regardless of how the
// move was made — any site, any device — as long as something fetches this
// platform's games between two of my own moves. In turn-based play that's
// guaranteed: the opponent has to act in between, and that's itself a fetch
// opportunity (auto-refresh, the watch cron, a manual refresh...).
//
// Returns the full reconciled set (for attaching to every game), just the
// entries that actually changed (all that needs writing back), and each
// entry's final count for the day it's rolling out of (before it resets to
// 0) — so that day's total survives the reset instead of being overwritten
// unrecorded; see addToMoveCountHistory.
function reconcile(prev: Record<string, MoveCountEntry>, games: Game[], today: string): {
  all: Record<string, MoveCountEntry>
  changed: Record<string, MoveCountEntry>
  closedDays: { date: string; count: number }[]
} {
  const all: Record<string, MoveCountEntry> = {}
  const changed: Record<string, MoveCountEntry> = {}
  const closedDays: { date: string; count: number }[] = []

  for (const g of games) {
    const entry = prev[g.id]
    if (!entry) {
      const fresh: MoveCountEntry = { myTurn: g.myTurn, todayDate: today, todayCount: 0 }
      all[g.id] = fresh
      changed[g.id] = fresh
      continue
    }

    const moved = entry.myTurn && !g.myTurn
    const rolledOver = entry.todayDate !== today
    if (!moved && !rolledOver && entry.myTurn === g.myTurn) {
      all[g.id] = entry
      continue
    }

    if (rolledOver) closedDays.push({ date: entry.todayDate, count: entry.todayCount })
    const base = rolledOver ? { ...entry, todayDate: today, todayCount: 0 } : entry
    const next: MoveCountEntry = moved
      ? { myTurn: g.myTurn, todayDate: today, todayCount: base.todayCount + 1 }
      : { ...base, myTurn: g.myTurn }
    all[g.id] = next
    changed[g.id] = next
  }

  return { all, changed, closedDays }
}

// Attaches `moveCountToday` to every game of this platform in a live list,
// and does the tracking reconciliation (see reconcile() above) as a side
// effect — this must run on every fetch for the tracking to work at all
// (same contract as attachFirstSeenProgress/attachProgress).
export async function attachMoveCounts(platform: Platform, games: Game[]): Promise<Game[]> {
  const relevant = games.filter(g => g.platform === platform)
  try {
    const prev = await getMoveCounts(platform)
    const today = todayKey()
    const { all, changed, closedDays } = reconcile(prev, relevant, today)

    const vanished = Object.keys(prev).filter(id => !(id in all))
    await Promise.all([putMoveCounts(platform, changed), deleteMoveCounts(platform, vanished), addToMoveCountHistory(closedDays)])

    return games.map(g => {
      if (g.platform !== platform) return g
      const count = all[g.id]?.todayCount
      return count ? { ...g, moveCountToday: count } : g
    })
  } catch {
    // A KV hiccup should just mean no counts shown this refresh, not that
    // the games themselves fail to show
    return games
  }
}
