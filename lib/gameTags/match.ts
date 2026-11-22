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

// Every (platform, title) tagged with the given tag — a title shows up
// here the moment it's tagged, whether or not it also happens to have an
// active game, a finished game, or a spot in some backlog list. Backlog's
// "browse by tag" view is built entirely from this, since none of those
// other three are reliable: a title you just tagged "live" for the first
// time has none of them yet.
export function titlesWithTag(byPlatform: GameTagsByPlatform | null, tag: string): { platform: Platform; gameName: string }[] {
  if (!byPlatform) return []
  const result: { platform: Platform; gameName: string }[] = []
  for (const [platform, entries] of Object.entries(byPlatform) as [Platform, Record<string, { tags: string[]; gameName?: string }>][]) {
    for (const [key, entry] of Object.entries(entries ?? {})) {
      // Falls back to the (lowercased) hash key for an entry saved before
      // gameName existed — imperfect casing, but it still shows up instead
      // of crashing a page that doesn't know this title's real name yet.
      // Editing its tags again from the History page corrects it for good.
      if (entry.tags.includes(tag)) result.push({ platform, gameName: entry.gameName ?? key })
    }
  }
  return result.sort((a, b) => a.gameName.localeCompare(b.gameName))
}
