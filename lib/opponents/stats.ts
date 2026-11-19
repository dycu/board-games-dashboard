import { FinishedGame, Platform } from '../types'
import { OpponentEntry } from './store'

// Mirrors lib/gameStats.ts's gameHistoryHref — the same "platform + name in
// the query string" shape, so any page linking to a person can build this
// without importing the whole stats module.
export function playerHref(platform: Platform, name: string): string {
  return `/players?${new URLSearchParams({ platform, name })}`
}

export interface GlobalOpponent {
  platform: Platform
  name: string
  games: number
  iWon: number
  theyWon: number
  lastPlayedAt: Date | null
  tags: string[]
  responseSamples: number[]
  medianResponseSeconds: number | null
  avatarUrl?: string
  profileUrl?: string
}

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Most platforms link to a person's own profile by name alone, so it's
// computed straight from (platform, name) — no live-game data needed,
// unlike the avatar, so it's there even for someone never seen in a
// currently active game. BGA needs its numeric id instead, which only a
// live game carries (see lib/connectors/bga.ts/lib/opponents/track.ts),
// so there `storedUrl` (persisted the same way as the avatar) is all
// there is. Other platforms investigated and found to have no working
// per-person link (Rally, boardtogether, …) are simply left out.
export function externalProfileUrl(platform: Platform, name: string, storedUrl?: string): string | undefined {
  if (platform === 'yucata') return `https://www.yucata.de/en/User/${encodeURIComponent(name)}`
  if (platform === 'obg') return `https://www.onlineboardgamers.com/profile/${encodeURIComponent(name)}/`
  return storedUrl
}

// Across every platform and game type at once — unlike lib/gameStats.ts's
// per-game-type opponents (scoped to one platform's own games list already,
// so a bare name is enough there), this needs platform in the key too, or a
// same-named player on two different sites would wrongly merge into one.
export function globalOpponents(games: FinishedGame[], entriesByPlatform: Partial<Record<Platform, Record<string, OpponentEntry>>>): GlobalOpponent[] {
  const byKey = new Map<string, GlobalOpponent>()

  for (const g of games) {
    for (const o of g.opponents ?? []) {
      const key = `${g.platform}:${o.name.toLowerCase()}`
      let r = byKey.get(key)
      if (!r) {
        const entry = entriesByPlatform[g.platform]?.[o.name]
        r = {
          platform: g.platform, name: o.name, games: 0, iWon: 0, theyWon: 0, lastPlayedAt: null,
          tags: entry?.tags ?? [], responseSamples: entry?.responseSamples ?? [], medianResponseSeconds: null,
          avatarUrl: entry?.avatarUrl, profileUrl: externalProfileUrl(g.platform, o.name, entry?.profileUrl),
        }
        byKey.set(key, r)
      }
      r.games++
      if (g.completedAt.getTime() > 0 && (!r.lastPlayedAt || g.completedAt > r.lastPlayedAt)) r.lastPlayedAt = g.completedAt
      if (g.result === 'coop') continue
      if (g.rank && o.rank) {
        if (g.rank < o.rank) r.iWon++
        else if (o.rank < g.rank) r.theyWon++
      } else if (g.result === 'won') r.iWon++
      else if (g.result === 'lost' && o.rank === 1) r.theyWon++
    }
  }

  // An opponent tagged or timed but never actually finished a game with
  // (no FinishedGame.opponents entry reached it above) still belongs in
  // the list — e.g. tagged from an active game, or finished-game history
  // for that platform simply isn't fetched (disabled, no creds)
  for (const [platform, entries] of Object.entries(entriesByPlatform) as [Platform, Record<string, OpponentEntry>][]) {
    for (const [name, entry] of Object.entries(entries)) {
      const key = `${platform}:${name.toLowerCase()}`
      if (byKey.has(key)) continue
      if (entry.tags.length === 0 && entry.responseSamples.length === 0 && !entry.avatarUrl && !entry.profileUrl) continue
      byKey.set(key, {
        platform, name, games: 0, iWon: 0, theyWon: 0, lastPlayedAt: null,
        tags: entry.tags, responseSamples: entry.responseSamples, medianResponseSeconds: null,
        avatarUrl: entry.avatarUrl, profileUrl: externalProfileUrl(platform, name, entry.profileUrl),
      })
    }
  }

  for (const r of byKey.values()) {
    if (r.responseSamples.length > 0) r.medianResponseSeconds = median([...r.responseSamples].sort((a, b) => a - b))
  }

  return [...byKey.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
}

// Every finished game against this one (platform, name) opponent — the
// per-person page's own history, newest first.
export function gamesWith(games: FinishedGame[], platform: Platform, name: string): FinishedGame[] {
  const n = name.toLowerCase()
  return games
    .filter(g => g.platform === platform && (g.opponents ?? []).some(o => o.name.toLowerCase() === n))
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
}
