import { kv } from '@vercel/kv'

const GAMES_KEY = 'eighteenxxpace:v2:games'

export interface EighteenxxPaceGame {
  id: string             // 18xx.games's numeric game id
  title: string           // e.g. "1846", "18USA" — 18xx hosts many different games
  end: number | null       // Unix seconds; null while still active
  actionCount: number | null // total entries in the game's own action log so far
  playerCount?: number
  // Unix seconds (the game's created_at) — for the time-based progress
  // fallback, used once a game is old enough that its action log is no
  // longer readable (see lib/eighteenxxPace/progress.ts). Always known, since
  // it's read off the games list itself rather than the per-game detail.
  start?: number
  // Set when the last attempt to read this game's action log failed; cleared
  // on the next success. Lets the UI tell "no estimate yet" apart from "the
  // mechanism is broken" for this game.
  lastError?: string
  lastCheckedAt?: number
}

export async function getEighteenxxPaceGames(): Promise<Record<string, EighteenxxPaceGame>> {
  return (await kv.hgetall<Record<string, EighteenxxPaceGame>>(GAMES_KEY)) ?? {}
}

export async function putEighteenxxPaceGames(games: EighteenxxPaceGame[]): Promise<void> {
  if (games.length === 0) return
  await kv.hset(GAMES_KEY, Object.fromEntries(games.map(g => [g.id, g])))
}
