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
  openedAt: number       // when it was opened from the dashboard (0 = unknown, saved by an older version)
  movedSeenAt?: number   // start of the first fetch that showed it's no longer my turn
  notePrompted?: boolean // the note-prompt popup has already been shown (saved, deleted or skipped) this cycle
}

export type Opened = Record<string, OpenedGame>

export const RETURN_GRACE_MS = 5 * 60 * 1000

// Whether the user was on the dashboard at time t, as far as we know
export function presentAt(t: number, presence: Presence): boolean {
  if (t < presence.returnedAt) return false
  return presence.leftAt === null || t < presence.leftAt
}

// `laggingPlatforms` are platforms known not to reflect a just-submitted
// move right away (see app/page.tsx's SETTLE_DELAY_PLATFORMS) — judge()
// gives a game on one of these `graceMs` from when it was *opened* before
// it will read a lingering myTurn:true as "nothing happened, bring it
// back" (right for a game only glanced at, wrong for one just played on a
// platform that's simply slow to report it). Computed straight from
// openedAt — already on the persisted record — rather than from a live
// "you just returned" event, so it holds up no matter how resolveOpened
// gets called: a full refresh, a scoped one, an unrelated periodic tick,
// or the first fetch after the OS silently reloaded a backgrounded tab
// (which isn't a back/forward navigation — see lib/navigation.ts — so it
// carries none of the live return-detection state a focus/visibilitychange
// handler would have set up).
export function resolveOpened(
  opened: Opened,
  games: { id: string; myTurn: boolean }[],
  fetchStartedAt: number,
  presence: Presence,
  graceMs = RETURN_GRACE_MS,
  laggingPlatforms: ReadonlySet<string> = new Set(),
): Opened {
  if (!presentAt(fetchStartedAt, presence)) return opened
  const byId = new Map(games.map(g => [g.id, g]))
  const next: Opened = {}
  let changed = false
  for (const [id, o] of Object.entries(opened)) {
    const protect = laggingPlatforms.has(id.split(':')[0])
    const kept = judge(o, byId.get(id), fetchStartedAt, graceMs, protect)
    if (kept) next[id] = kept
    if (kept !== o) changed = true
  }
  return changed ? next : opened
}

// One opened game's own verdict for a given fetch — resolveOpened's inner
// loop. Exported in its own right for direct unit tests of its branches.
export function judge(o: OpenedGame, game: { myTurn: boolean } | undefined, fetchStartedAt: number, graceMs: number, protect = false): OpenedGame | null {
  // Opened after this fetch started: it can't show my move yet
  if (fetchStartedAt < o.openedAt) return o
  // Gone (ended): no longer opened
  if (!game) return null
  if (game.myTurn) {
    // Still showing as my turn normally means nothing happened (reset) —
    // unless this is a lagging platform within its grace window, in which
    // case this isn't evidence either way: keep waiting instead of
    // concluding the move was never made.
    if (protect && fetchStartedAt < o.openedAt + graceMs) return o
    return null
  }
  const movedSeenAt = o.movedSeenAt ?? fetchStartedAt
  if (fetchStartedAt >= movedSeenAt + graceMs) return null
  return o.movedSeenAt === undefined ? { ...o, movedSeenAt } : o
}

// Which (if any) opened game should prompt for a note right now: the first
// one whose move is confirmed (movedSeenAt set — see judge() above) and that
// hasn't already been prompted for since it was opened. Only movedSeenAt
// counts, not mere presence in `opened`: that becomes true the instant the
// game is clicked (storeOpenedNow, before any navigation), while movedSeenAt
// is only set once a fetch made while actually back on the dashboard
// confirms the move — i.e. the moment to actually ask about the next one.
// notePrompted lives in `opened` itself (stored alongside openedAt/
// movedSeenAt — see storeOpenedNow/writeStoredOpened) rather than separate
// component state, so a plain page reload doesn't forget it was answered.
export function nextNotePrompt(opened: Opened): string | null {
  for (const [id, o] of Object.entries(opened)) {
    if (o.movedSeenAt !== undefined && !o.notePrompted) return id
  }
  return null
}

// The distinct platforms behind the currently-opened games ("bga:12345" ->
// "bga") — lets a return-from-a-game refresh check only those platforms
// instead of every configured one.
export function openedPlatforms(opened: Opened): string[] {
  return [...new Set(Object.keys(opened).map(id => id.split(':')[0]))]
}

export type ReturnRefresh =
  | { kind: 'full' }               // the auto-refresh interval has already lapsed — refresh everything, it's all due anyway
  | { kind: 'platforms'; platforms: string[] } // not due yet, but a game is open — just re-check its platform(s)
  | { kind: 'none' }                // neither — nothing to do on this return

// The one decision for "what, if anything, to refresh when the tab becomes
// visible again". Kept as a single pure function (rather than one check in
// useAutoRefresh and a separate one in app/page.tsx, as it used to be) so
// there's exactly one place deciding this — two independent checks on the
// same visibilitychange event could each trigger their own refresh and race
// each other, which is exactly what made a platform-scoped refresh pointless
// whenever the interval had also lapsed.
export function decideReturnRefresh(opened: Opened, staleForMs: number, intervalMs: number): ReturnRefresh {
  if (intervalMs > 0 && staleForMs >= intervalMs) return { kind: 'full' }
  const platforms = openedPlatforms(opened)
  return platforms.length > 0 ? { kind: 'platforms', platforms } : { kind: 'none' }
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
