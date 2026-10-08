import { Game, UserPrefs } from './types'

export const DEADLINE_SOON_MS = 24 * 3600 * 1000

// Ms until this game's deadline when it's my move and the deadline is near, else null
export function deadlineSoon(g: Game, now: number): number | null {
  if (!g.myTurn || !g.deadlineAt) return null
  const left = new Date(g.deadlineAt).getTime() - now
  return left < DEADLINE_SOON_MS ? left : null
}

export function sortAndFilter(games: Game[], prefs: UserPrefs, now = Date.now()): Game[] {
  const { pins, sort, filter } = prefs

  const result = games.filter(g => {
    if (filter.turnStatus === 'my-turn' && !g.myTurn) return false
    if (filter.turnStatus === 'waiting' && g.myTurn) return false
    if (filter.platforms.length > 0 && !filter.platforms.includes(g.platform)) return false
    return true
  })

  result.sort((a, b) => {
    // A move about to time out comes before everything else, pins included, soonest first
    const aSoon = deadlineSoon(a, now)
    const bSoon = deadlineSoon(b, now)
    if (aSoon !== null || bSoon !== null) {
      if (aSoon === null) return 1
      if (bSoon === null) return -1
      return aSoon - bSoon
    }

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
