import { Platform } from '../types'

interface PlayedInput {
  platform: Platform
  gameName: string
  gameType?: string
  gameUrl: string
}

export interface PlayedGame {
  platform: Platform
  gameName: string
  gameUrl: string             // the most recent table, used to work out the play URL
  plays: number               // finished games in the fetched history
  playingNow: number
  lastPlayedAt: Date | null   // latest known finish
}

export type PlayedSort = 'most' | 'least' | 'recent' | 'name'

// One entry per platform and game. Table titles (OBG, choochoo) are grouped under
// their game type so "Antiquity — Grave farm" counts as a play of Antiquity.
export function aggregatePlayed(
  active: PlayedInput[],
  finished: (PlayedInput & { completedAt: Date })[],
): PlayedGame[] {
  const byKey = new Map<string, PlayedGame>()
  const entry = (g: PlayedInput) => {
    const gameName = g.gameType || g.gameName
    const key = `${g.platform}:${gameName.toLowerCase()}`
    let e = byKey.get(key)
    if (!e) {
      e = { platform: g.platform, gameName, gameUrl: g.gameUrl, plays: 0, playingNow: 0, lastPlayedAt: null }
      byKey.set(key, e)
    }
    return e
  }
  active.forEach(g => { entry(g).playingNow++ })
  finished.forEach(g => {
    const e = entry(g)
    e.plays++
    // choochoo reports an unknown finish time as epoch 0
    if (g.completedAt.getTime() > 0 && (!e.lastPlayedAt || g.completedAt > e.lastPlayedAt)) {
      e.lastPlayedAt = g.completedAt
      if (!e.playingNow) e.gameUrl = g.gameUrl
    }
  })
  return [...byKey.values()]
}

export function sortPlayed(list: PlayedGame[], mode: PlayedSort): PlayedGame[] {
  const byName = (a: PlayedGame, b: PlayedGame) => a.gameName.localeCompare(b.gameName)
  const compare: Record<PlayedSort, (a: PlayedGame, b: PlayedGame) => number> = {
    most: (a, b) => b.plays - a.plays || byName(a, b),
    least: (a, b) => a.plays - b.plays || byName(a, b),
    recent: (a, b) =>
      Math.sign(b.playingNow) - Math.sign(a.playingNow)
      || (b.lastPlayedAt?.getTime() ?? 0) - (a.lastPlayedAt?.getTime() ?? 0)
      || byName(a, b),
    name: byName,
  }
  return [...list].sort(compare[mode])
}
