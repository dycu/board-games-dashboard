import { kv } from '@vercel/kv'
import { Platform } from '../types'

export interface MoveCountEntry {
  myTurn: boolean    // last observed value, to detect the true -> false flip that means a move just landed
  todayDate: string   // YYYY-MM-DD, Europe/Warsaw — see lib/moveCounts/track.ts
  todayCount: number
}

function trackedKey(platform: Platform): string {
  return `movecounts:v1:${platform}`
}

export async function getMoveCounts(platform: Platform): Promise<Record<string, MoveCountEntry>> {
  return (await kv.hgetall<Record<string, MoveCountEntry>>(trackedKey(platform))) ?? {}
}

export async function putMoveCounts(platform: Platform, entries: Record<string, MoveCountEntry>): Promise<void> {
  if (Object.keys(entries).length === 0) return
  await kv.hset(trackedKey(platform), entries)
}

export async function deleteMoveCounts(platform: Platform, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await kv.hdel(trackedKey(platform), ...ids)
}
