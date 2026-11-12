import { kv } from '@vercel/kv'

// OKC's own snapshot carries no wall-clock timestamp (the game tracks state
// by revision, not by time), so "time since last move" has to be derived
// here instead: each poll compares the state it just fetched against what we
// last saw for that game id, and only bumps the stored timestamp when the
// state actually changed. A KV outage just means the next poll looks like a
// fresh move rather than losing the dashboard entirely, so every call is
// best-effort.
export interface OkcActivity {
  signature: string
  lastMoveAt: string // ISO
}

const key = (gameId: string) => `okc-activity:v1:${gameId}`

export async function getActivity(gameId: string): Promise<OkcActivity | null> {
  try {
    return await kv.get<OkcActivity>(key(gameId))
  } catch {
    return null
  }
}

export async function setActivity(gameId: string, activity: OkcActivity): Promise<void> {
  try {
    await kv.set(key(gameId), activity)
  } catch {
    // best-effort — see module comment
  }
}
