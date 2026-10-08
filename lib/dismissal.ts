// When the user opens a game, the dashboard hides it until fresh data shows
// its real state. Data fetched while the user was away (playing in another
// tab, or the dashboard in the background) predates their move, so it must
// not bring the game back — only a fetch started a while after they returned
// may, so the just-played game stays (dimmed) long enough to add a note.
export interface Presence {
  returnedAt: number      // last time the dashboard became visible and focused (or loaded)
  leftAt: number | null   // last time it lost visibility or focus, if after returnedAt
}

export const RETURN_GRACE_MS = 5 * 60 * 1000

export function fetchSeesReturn(fetchStartedAt: number, presence: Presence, graceMs = RETURN_GRACE_MS): boolean {
  // returnedAt 0 = here since the page loaded, no grace needed
  if (fetchStartedAt < presence.returnedAt + (presence.returnedAt ? graceMs : 0)) return false
  // Started after leaving again → it ran while the user was away
  if (presence.leftAt !== null && fetchStartedAt >= presence.leftAt) return false
  return true
}

// Which opened games stay dimmed after a fresh fetch:
// - fetched while away → all of them (the data predates my move)
// - fetched since I'm back → the ones where I made my move stay dimmed for
//   the grace period (time for a note); ones still waiting for me come back
// - fetched after the grace period → none
export function openedAfterFetch(
  opened: Set<string>,
  games: { id: string; myTurn: boolean }[],
  fetchStartedAt: number,
  presence: Presence,
): Set<string> {
  if (!fetchSeesReturn(fetchStartedAt, presence, 0)) return opened
  if (fetchSeesReturn(fetchStartedAt, presence)) return new Set()
  const stillMine = new Set(games.filter(g => g.myTurn).map(g => g.id))
  const present = new Set(games.map(g => g.id))
  return new Set([...opened].filter(id => present.has(id) && !stillMine.has(id)))
}

// A short glance away (alt-tab and back) isn't worth a refresh
export const AWAY_REFRESH_MS = 3000
