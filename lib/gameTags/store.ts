import { kv } from '@vercel/kv'
import { Platform } from '../types'

// Keyed by platform + the title lowercased — the same matching gamesOf()
// (lib/gameStats.ts) already uses to group every instance of one game
// together, so a tag set from the History game page lines up with every
// other place that groups games by title the same way.
export interface GameTagEntry {
  tags: string[]
  // The title as actually typed on the History game page (the hash field
  // itself is lowercased for matching, which loses the real casing) — kept
  // so a tagged title can be listed and launched (Backlog's "browse by
  // tag" view) even when it has no active game, no finished game and no
  // backlog entry of its own to read a display name from.
  gameName: string
}

function key(platform: Platform): string {
  return `gametags:v1:${platform}`
}

export function gameTagKey(gameName: string): string {
  return gameName.toLowerCase()
}

export async function getGameTags(platform: Platform): Promise<Record<string, GameTagEntry>> {
  return (await kv.hgetall<Record<string, GameTagEntry>>(key(platform))) ?? {}
}

export async function setGameTags(platform: Platform, gameName: string, tags: string[]): Promise<void> {
  const k = gameTagKey(gameName)
  if (tags.length === 0) {
    await kv.hdel(key(platform), k)
    return
  }
  await kv.hset(key(platform), { [k]: { tags, gameName } })
}
