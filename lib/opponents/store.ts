import { kv } from '@vercel/kv'
import { Platform } from '../types'

// Keyed by platform + the name as that platform spells it — no cross-platform
// identity matching (the same person under different usernames on two sites
// is two separate entries here, same as everywhere else in this app that
// reads a name off a scraped page).
export interface OpponentEntry {
  tags: string[]
  // How long this opponent took to respond after my move landed, in
  // seconds — a rolling window (see track.ts), oldest dropped once full.
  responseSamples: number[]
  // Small avatar image URL, when the platform exposes one (see track.ts) —
  // same shape as Game.playerAvatars, just persisted per person instead of
  // per live game so it's available on the Players page too.
  avatarUrl?: string
  // Link to this person's own profile page on the platform, when it needs
  // data (e.g. BGA's numeric id) only available from a live game — same
  // shape as Game.playerProfileUrls. Platforms that link by name alone
  // don't need this; see lib/opponents/stats.ts's externalProfileUrl.
  profileUrl?: string
}

const MAX_SAMPLES = 20

function key(platform: Platform): string {
  return `opponents:v1:${platform}`
}

export async function getOpponents(platform: Platform): Promise<Record<string, OpponentEntry>> {
  return (await kv.hgetall<Record<string, OpponentEntry>>(key(platform))) ?? {}
}

export async function putOpponents(platform: Platform, entries: Record<string, OpponentEntry>): Promise<void> {
  if (Object.keys(entries).length === 0) return
  await kv.hset(key(platform), entries)
}

export async function setTags(platform: Platform, name: string, tags: string[]): Promise<void> {
  const current = await getOpponents(platform)
  const entry = current[name] ?? { tags: [], responseSamples: [] }
  await kv.hset(key(platform), { [name]: { ...entry, tags } })
}

export async function addResponseSample(platform: Platform, name: string, seconds: number): Promise<void> {
  const current = await getOpponents(platform)
  const entry = current[name] ?? { tags: [], responseSamples: [] }
  const responseSamples = [...entry.responseSamples, seconds].slice(-MAX_SAMPLES)
  await kv.hset(key(platform), { [name]: { ...entry, responseSamples } })
}

// Per-game tracking state for response-time detection (see track.ts) — not
// the opponent data itself, just enough to notice a myTurn flip and measure
// how long it took. Separate hash (per platform, keyed by game id) since its
// shape and lifecycle (one entry per *game*, dropped once the game ends)
// are nothing like the OpponentEntry hash above (one entry per *person*,
// kept indefinitely).
export interface GameWatchEntry {
  myTurn: boolean
  since: number          // unix seconds this myTurn value was first observed
  opponentName?: string  // resolved while waiting on them — see track.ts
}

function watchKey(platform: Platform): string {
  return `responsetimewatch:v1:${platform}`
}

export async function getGameWatch(platform: Platform): Promise<Record<string, GameWatchEntry>> {
  return (await kv.hgetall<Record<string, GameWatchEntry>>(watchKey(platform))) ?? {}
}

export async function putGameWatch(platform: Platform, entries: Record<string, GameWatchEntry>): Promise<void> {
  if (Object.keys(entries).length === 0) return
  await kv.hset(watchKey(platform), entries)
}

export async function deleteGameWatch(platform: Platform, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await kv.hdel(watchKey(platform), ...ids)
}
