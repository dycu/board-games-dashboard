// When the user opens a game, the dashboard hides it until fresh data shows
// its real state. Data fetched while the user was away (playing in another
// tab, or the dashboard in the background) predates their move, so it must
// not bring the game back — only a fetch started after they returned may.
export interface Presence {
  returnedAt: number      // last time the dashboard became visible and focused (or loaded)
  leftAt: number | null   // last time it lost visibility or focus, if after returnedAt
}

export function fetchSeesReturn(fetchStartedAt: number, presence: Presence): boolean {
  if (fetchStartedAt < presence.returnedAt) return false
  // Started after leaving again → it ran while the user was away
  if (presence.leftAt !== null && fetchStartedAt >= presence.leftAt) return false
  return true
}

// A short glance away (alt-tab and back) isn't worth a refresh
export const AWAY_REFRESH_MS = 3000
