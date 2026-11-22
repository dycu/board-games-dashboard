import { Platform } from '../types'

// gameName is optional here (even though a fresh write always includes it —
// see lib/gameTags/store.ts's GameTagEntry) because this describes whatever
// this account's KV data actually holds, which can include an entry saved
// before that field existed.
export type GameTagsByPlatform = Partial<Record<Platform, Record<string, { tags: string[]; gameName?: string }>>>

// The same lowercase-title matching gamesOf() (lib/gameStats.ts) uses to
// group every instance of one game together — so a tag set here lines up
// with every other place that groups games by title that way.
export function gameTagsOf(byPlatform: GameTagsByPlatform | null, platform: Platform, gameName: string): string[] {
  return byPlatform?.[platform]?.[gameName.toLowerCase()]?.tags ?? []
}

// Every distinct tag currently in use, across every platform — offered as
// filter chips and as TagEditor's suggestions.
export function allGameTags(byPlatform: GameTagsByPlatform | null): string[] {
  if (!byPlatform) return []
  const set = new Set<string>()
  for (const entries of Object.values(byPlatform)) {
    for (const entry of Object.values(entries ?? {})) for (const t of entry.tags) set.add(t)
  }
  return [...set].sort()
}
