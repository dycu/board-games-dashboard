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

// One hash, field = day (YYYY-MM-DD, the same 5am-5am Europe/Warsaw day as
// MoveCountEntry.todayDate), value = total moves across every game and
// platform that day — so "yesterday" survives the day's own counter
// resetting to 0, and a chart can be drawn from it.
const HISTORY_KEY = 'movecounts-history:v1'

export async function getMoveCountHistory(): Promise<Record<string, number>> {
  return (await kv.hgetall<Record<string, number>>(HISTORY_KEY)) ?? {}
}

// Each game rolling over to a new day contributes its own final count for
// the day that just ended — summed here per date first so a batch with
// several games closing out the same day sends one increment, not several
// (no difference to the final total, just fewer round trips).
export async function addToMoveCountHistory(contributions: { date: string; count: number }[]): Promise<void> {
  const byDate = new Map<string, number>()
  for (const c of contributions) {
    if (c.count > 0) byDate.set(c.date, (byDate.get(c.date) ?? 0) + c.count)
  }
  await Promise.all([...byDate].map(([date, amount]) => kv.hincrby(HISTORY_KEY, date, amount)))
}
