import { kv } from '@vercel/kv'
import { Platform } from '../types'

// Keyed by platform + the title lowercased — the same matching gamesOf()
// (lib/gameStats.ts) already uses to group every instance of one game
// together, so a tag set from the History game page lines up with every
// other place that groups games by title the same way.
export interface GameTagEntry {
  tags: string[]
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
  const current = await getGameTags(platform)
  const k = gameTagKey(gameName)
  const existing = current[k] ?? { tags: [] }
  if (tags.length === 0) {
    await kv.hdel(key(platform), k)
    return
  }
  await kv.hset(key(platform), { [k]: { ...existing, tags } })
}
