import { kv } from '@vercel/kv'

const TABLES_KEY = 'rallypace:v1:games'

export interface RallyPaceGame {
  id: string            // Rally's numeric table id
  game: string           // title slug, e.g. "maria" — Rally hosts many different games
  end: number | null     // Unix seconds; null while still active
  turn: number | null    // last known turn number from the game's own live state
  playerCount?: number
  // Set when the last attempt to read this game's live state failed (timeout,
  // WS error, no numeric turn in the response); cleared on the next success.
  // Lets the UI tell "no data yet" apart from "the mechanism is broken" for
  // this game, without erroring loudly on the dashboard itself.
  lastError?: string
  lastCheckedAt?: number // Unix seconds, whenever lastError was last set or cleared
}

export async function getRallyGames(): Promise<Record<string, RallyPaceGame>> {
  return (await kv.hgetall<Record<string, RallyPaceGame>>(TABLES_KEY)) ?? {}
}

export async function putRallyGames(games: RallyPaceGame[]): Promise<void> {
  if (games.length === 0) return
  await kv.hset(TABLES_KEY, Object.fromEntries(games.map(g => [g.id, g])))
}
