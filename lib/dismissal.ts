// When the user opens a game, the dashboard dims it until fresh data shows
// its real state. A fetch can only judge a game if it started after the game
// was opened and while the user was back on the dashboard — anything else
// may predate their move. A game they played stays dimmed for a few minutes
// after the move is first seen, so a note can still be added.
export interface Presence {
  returnedAt: number      // last time the dashboard became visible and focused (0 = here since the page loaded)
  leftAt: number | null   // last time it lost visibility or focus, if after returnedAt
}

export interface OpenedGame {
  openedAt: number     // when it was opened from the dashboard (0 = unknown, saved by an older version)
  movedSeenAt?: number // start of the first fetch that showed it's no longer my turn
}

export type Opened = Record<string, OpenedGame>

export const RETURN_GRACE_MS = 5 * 60 * 1000

// Whether the user was on the dashboard at time t, as far as we know
export function presentAt(t: number, presence: Presence): boolean {
  if (t < presence.returnedAt) return false
  return presence.leftAt === null || t < presence.leftAt
}

export function resolveOpened(
  opened: Opened,
  games: { id: string; myTurn: boolean }[],
  fetchStartedAt: number,
  presence: Presence,
  graceMs = RETURN_GRACE_MS,
): Opened {
  if (!presentAt(fetchStartedAt, presence)) return opened
  const byId = new Map(games.map(g => [g.id, g]))
  const next: Opened = {}
  let changed = false
  for (const [id, o] of Object.entries(opened)) {
    const kept = judge(o, byId.get(id), fetchStartedAt, graceMs)
    if (kept) next[id] = kept
    if (kept !== o) changed = true
  }
  return changed ? next : opened
}

function judge(o: OpenedGame, game: { myTurn: boolean } | undefined, fetchStartedAt: number, graceMs: number): OpenedGame | null {
  // Opened after this fetch started: it can't show my move yet
  if (fetchStartedAt < o.openedAt) return o
  // Gone (ended) or still waiting for me: no longer opened
  if (!game || game.myTurn) return null
  const movedSeenAt = o.movedSeenAt ?? fetchStartedAt
  if (fetchStartedAt >= movedSeenAt + graceMs) return null
  return o.movedSeenAt === undefined ? { ...o, movedSeenAt } : o
}

export const OPENED_KEY = 'dismissed-games'

export function readStoredOpened(): Opened {
  try { return parseStoredOpened(localStorage.getItem(OPENED_KEY)) } catch { return {} }
}

export function writeStoredOpened(opened: Opened): void {
  try {
    if (Object.keys(opened).length === 0) localStorage.removeItem(OPENED_KEY)
    else localStorage.setItem(OPENED_KEY, JSON.stringify(opened))
  } catch { /* storage unavailable */ }
}

// Saved straight away in the click handler: a game opened in this tab (BGA)
// unloads the page, so a deferred state update may never run
export function storeOpenedNow(id: string, at = Date.now()): Opened {
  const next = { ...readStoredOpened(), [id]: { openedAt: at } }
  writeStoredOpened(next)
  return next
}

// Stored as {id: OpenedGame}; older versions stored a plain list of ids
export function parseStoredOpened(raw: string | null): Opened {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return Object.fromEntries(parsed.filter(id => typeof id === 'string').map(id => [id, { openedAt: 0 }]))
    if (parsed && typeof parsed === 'object') return parsed as Opened
  } catch { /* fall through */ }
  return {}
}

// A short glance away (alt-tab and back) isn't worth a refresh
export const AWAY_REFRESH_MS = 3000
