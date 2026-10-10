import { Game, UserPrefs } from './types'

// Shown as a "Xh left" chip from a day out…
export const DEADLINE_SOON_MS = 24 * 3600 * 1000
// …but only moved ahead of the other games once really close (or overdue):
// BGA's async turns nearly always have under a day left, so a 24h cut-off
// put every BGA game ahead of everything else
export const DEADLINE_URGENT_MS = 6 * 3600 * 1000

// Ms until this game's deadline when it's my move and the deadline is within `within`, else null
export function deadlineSoon(g: Game, now: number, within = DEADLINE_SOON_MS): number | null {
  if (!g.myTurn || !g.deadlineAt) return null
  const left = new Date(g.deadlineAt).getTime() - now
  return left < within ? left : null
}

export function sortAndFilter(games: Game[], prefs: UserPrefs, now = Date.now()): Game[] {
  const { pins, sort, filter } = prefs
  const sunk = prefs.sunk ?? []

  const result = games.filter(g => {
    if (filter.turnStatus === 'my-turn' && !g.myTurn) return false
    if (filter.turnStatus === 'waiting' && g.myTurn) return false
    if (filter.platforms.length > 0 && !filter.platforms.includes(g.platform)) return false
    return true
  })

  result.sort((a, b) => {
    // Sunk games always last in their section (Your turn or Waiting),
    // regardless of pin/deadline/sort — the opposite of pinning, for games
    // you don't want competing for the top (e.g. solo games)
    const aSunk = sunk.includes(a.id)
    const bSunk = sunk.includes(b.id)
    if (aSunk && !bSunk) return 1
    if (bSunk && !aSunk) return -1

    const aPinned = pins.includes(a.id)
    const bPinned = pins.includes(b.id)

    // Pinned + myTurn first
    if (aPinned && a.myTurn && !(bPinned && b.myTurn)) return -1
    if (bPinned && b.myTurn && !(aPinned && a.myTurn)) return 1

    // Then pinned + waiting
    if (aPinned && !bPinned) return -1
    if (bPinned && !aPinned) return 1

    // Then myTurn before waiting
    if (a.myTurn && !b.myTurn) return -1
    if (b.myTurn && !a.myTurn) return 1

    // Within a group, a move about to time out (or overdue) comes first, soonest first
    const aSoon = deadlineSoon(a, now, DEADLINE_URGENT_MS)
    const bSoon = deadlineSoon(b, now, DEADLINE_URGENT_MS)
    if (aSoon !== null || bSoon !== null) {
      if (aSoon === null) return 1
      if (bSoon === null) return -1
      return aSoon - bSoon
    }

    // Within same group, apply sort
    if (sort === 'most-recent') {
      return b.lastMoveAt.getTime() - a.lastMoveAt.getTime()
    }
    if (sort === 'game-name') {
      return a.gameName.localeCompare(b.gameName)
    }
    if (sort === 'platform') {
      return a.platform.localeCompare(b.platform)
    }
    // longest-wait: oldest move first
    return a.lastMoveAt.getTime() - b.lastMoveAt.getTime()
  })

  return result
}
