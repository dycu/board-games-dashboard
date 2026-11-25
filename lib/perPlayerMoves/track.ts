import { Game, Platform } from '../types'
import { todayKey } from '../moveCounts/track'
import { resolveOpponent } from '../opponents/track'
import { PerPlayerWatchEntry, GameDayCounts, getWatch, putWatch, deleteWatch, getGameDays, putDays, deleteDays } from './store'

// Fallback credits for a 3+ player game with no reported currentPlayer —
// resolveOpponent() can't say exactly who moved, but myTurn itself always
// says whether it was *my* move or someone else's, so that split is always
// available even when the exact name isn't.
export const ME_KEY = 'me'
export const OPPONENTS_KEY = 'opponents'

// Same true/false-flip detection as lib/moveCounts/track.ts and
// lib/opponents/track.ts, but crediting a specific player (or one of the
// two fallback keys above) for each move instead of counting a total or
// timing a response. myTurn flipping true -> false is always *my* move,
// unambiguously — the other three cases (false -> true, or the resolved
// opponent changing mid-wait without myTurn flipping at all, in a 3+
// player game that does report who's up) credit whichever opponent was
// being waited on, or OPPONENTS_KEY when that was never resolved.
function reconcile(prevWatch: Record<string, PerPlayerWatchEntry>, games: Game[]): {
  all: Record<string, PerPlayerWatchEntry>
  changed: Record<string, PerPlayerWatchEntry>
  increments: Record<string, Record<string, number>> // gameId -> playerKey -> moves to credit today
} {
  const all: Record<string, PerPlayerWatchEntry> = {}
  const changed: Record<string, PerPlayerWatchEntry> = {}
  const increments: Record<string, Record<string, number>> = {}

  const credit = (gameId: string, playerKey: string, amount = 1) => {
    const forGame = increments[gameId] ?? (increments[gameId] = {})
    forGame[playerKey] = (forGame[playerKey] ?? 0) + amount
  }

  for (const g of games) {
    const prev = prevWatch[g.id]
    const opponentName = resolveOpponent(g)

    if (!prev) {
      const fresh: PerPlayerWatchEntry = { myTurn: g.myTurn, opponentName }
      all[g.id] = fresh
      changed[g.id] = fresh
      // The very first time this tracker sees a table, lib/moveCounts/
      // track.ts (running far longer already) may already have a count of
      // *my* moves today on it — back-credit that now rather than quietly
      // starting from zero, so a table already active today doesn't show
      // up with no history at all. It only ever counts my own moves (an
      // opponent's are never visible to it), so there's nothing to
      // back-credit for opponents.
      if (g.moveCountToday) credit(g.id, ME_KEY, g.moveCountToday)
      continue
    }

    if (prev.myTurn === g.myTurn) {
      // Mid-wait handoff: the previous opponent's move just completed even
      // though myTurn itself never flipped (a 3+ player game that reports
      // currentPlayer, moving on to someone else without coming back to me).
      if (!prev.myTurn && opponentName !== undefined && opponentName !== prev.opponentName) {
        credit(g.id, prev.opponentName ?? OPPONENTS_KEY)
        const next: PerPlayerWatchEntry = { myTurn: prev.myTurn, opponentName }
        all[g.id] = next
        changed[g.id] = next
      } else {
        all[g.id] = prev
      }
      continue
    }

    credit(g.id, prev.myTurn ? ME_KEY : (prev.opponentName ?? OPPONENTS_KEY))
    const next: PerPlayerWatchEntry = { myTurn: g.myTurn, opponentName }
    all[g.id] = next
    changed[g.id] = next
  }

  return { all, changed, increments }
}

// Side effect only (same contract as attachMoveCounts/attachOpponentTracking
// — must run on every fetch for the tracking to work at all): credits
// today's moves per player onto each table's own history, read back by
// app/api/table-moves for the popup chart on its card.
export async function attachPerPlayerMoveCounts(platform: Platform, games: Game[]): Promise<Game[]> {
  // Same exclusion as lib/opponents/track.ts's attachOpponentTracking, and
  // for the same reason: a lobby's currentPlayer is pendingLobbyText's own
  // status blurb, not a player name, and resolveOpponent can't tell the
  // difference — left in, that text got "credited" with a move once the
  // table actually started and the real first player took its place.
  const relevant = games.filter(g => g.platform === platform && !g.pending)
  try {
    const today = todayKey()
    const prevWatch = await getWatch(platform)
    const { all, changed, increments } = reconcile(prevWatch, relevant)
    const vanished = Object.keys(prevWatch).filter(id => !(id in all))

    const creditedIds = Object.keys(increments)
    const currentDays = await Promise.all(creditedIds.map(id => getGameDays(platform, id)))
    const dayUpdates: Record<string, GameDayCounts> = {}
    creditedIds.forEach((id, i) => {
      const current = currentDays[i]
      const todayCounts = { ...(current[today] ?? {}) }
      for (const [playerKey, n] of Object.entries(increments[id])) {
        todayCounts[playerKey] = (todayCounts[playerKey] ?? 0) + n
      }
      dayUpdates[id] = { ...current, [today]: todayCounts }
    })

    await Promise.all([
      putWatch(platform, changed),
      deleteWatch(platform, vanished),
      putDays(platform, dayUpdates),
      deleteDays(platform, vanished),
    ])
  } catch {
    // A KV hiccup should just mean no per-player history recorded this
    // refresh, not that the games themselves fail to show
  }
  return games
}
