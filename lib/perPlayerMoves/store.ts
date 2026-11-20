import { kv } from '@vercel/kv'
import { Platform } from '../types'

// Bare-minimum tracking state per active game — just enough to notice a
// myTurn flip or a resolved opponent changing, the same transition
// detection lib/opponents/track.ts already does for response-time
// sampling. No `since` here: this counts moves, not durations.
export interface PerPlayerWatchEntry {
  myTurn: boolean
  opponentName?: string
}

// date (YYYY-MM-DD, same 5am-5am Europe/Warsaw day as the rest of
// lib/moveCounts) -> playerKey -> moves that day. playerKey is one of
// ME_KEY, OPPONENTS_KEY (see track.ts), or a resolved opponent's own name.
export type GameDayCounts = Record<string, Record<string, number>>

function watchKey(platform: Platform): string {
  return `pptrack-watch:v1:${platform}`
}
function daysKey(platform: Platform): string {
  return `pptrack-days:v1:${platform}`
}

export async function getWatch(platform: Platform): Promise<Record<string, PerPlayerWatchEntry>> {
  return (await kv.hgetall<Record<string, PerPlayerWatchEntry>>(watchKey(platform))) ?? {}
}

export async function putWatch(platform: Platform, entries: Record<string, PerPlayerWatchEntry>): Promise<void> {
  if (Object.keys(entries).length === 0) return
  await kv.hset(watchKey(platform), entries)
}

export async function deleteWatch(platform: Platform, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await kv.hdel(watchKey(platform), ...ids)
}

export async function getAllDays(platform: Platform): Promise<Record<string, GameDayCounts>> {
  return (await kv.hgetall<Record<string, GameDayCounts>>(daysKey(platform))) ?? {}
}

export async function putDays(platform: Platform, entries: Record<string, GameDayCounts>): Promise<void> {
  if (Object.keys(entries).length === 0) return
  await kv.hset(daysKey(platform), entries)
}

export async function deleteDays(platform: Platform, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await kv.hdel(daysKey(platform), ...ids)
}

// One specific table's own history — read directly by id rather than
// pulling every tracked game on the platform, since this is only ever
// looked up one table at a time (the popup for that one card).
export async function getGameDays(platform: Platform, gameId: string): Promise<GameDayCounts> {
  return (await kv.hget<GameDayCounts>(daysKey(platform), gameId)) ?? {}
}
