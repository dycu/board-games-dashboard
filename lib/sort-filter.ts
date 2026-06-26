import { Game, UserPrefs } from './types'

export function sortAndFilter(games: Game[], prefs: UserPrefs): Game[] {
  const { pins, sort, filter } = prefs

  let result = games.filter(g => {
    if (filter.turnStatus === 'my-turn' && !g.myTurn) return false
    if (filter.turnStatus === 'waiting' && g.myTurn) return false
    if (filter.platforms.length > 0 && !filter.platforms.includes(g.platform)) return false
    return true
  })

  result.sort((a, b) => {
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
