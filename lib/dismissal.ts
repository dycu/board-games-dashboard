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
  // Set on return from a platform known to not reflect a just-submitted
  // move right away (see app/page.tsx's SETTLE_DELAY_PLATFORMS) — until
  // this time, judge() won't read a lingering myTurn:true as "nothing
  // happened, bring it back": that reading is correct for a game only
  // glanced at, wrong for one just played on a platform that's simply
  // slow to reflect it. Lives on the persisted record itself, so every
  // refresh respects it (a full refresh, a scoped one, the return flow's
  // own extra checks, or an unrelated periodic tick) without separate
  // bookkeeping to keep in sync between them, and it survives a reload.
  protectUntil?: number
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

// Called on return from a lagging platform's game (app/page.tsx) — bumps
// protectUntil for the given ids so judge() won't prematurely reset them
// while the platform catches up. Takes the max with any existing
// protectUntil instead of overwriting it, so a second quick return can't
// shorten an already-running protection window.
export function protectLaggingGames(opened: Opened, ids: string[], until: number): Opened {
  if (ids.length === 0) return opened
  let next: Opened | null = null
  for (const id of ids) {
    const o = opened[id]
    if (!o) continue
    const nextUntil = Math.max(o.protectUntil ?? 0, until)
    if (nextUntil !== o.protectUntil) {
      next = { ...(next ?? opened), [id]: { ...o, protectUntil: nextUntil } }
    }
  }
  return next ?? opened
}

// One opened game's own verdict for a given fetch — resolveOpened's inner
// loop. Exported in its own right for direct unit tests of its branches.
export function judge(o: OpenedGame, game: { myTurn: boolean } | undefined, fetchStartedAt: number, graceMs: number): OpenedGame | null {
  // Opened after this fetch started: it can't show my move yet
  if (fetchStartedAt < o.openedAt) return o
  // Gone (ended): no longer opened
  if (!game) return null
  if (game.myTurn) {
    // Still showing as my turn normally means nothing happened (reset) —
    // unless protectUntil says a lagging platform just hasn't reflected
    // the move yet, in which case this isn't evidence either way: keep
    // waiting instead of concluding the move was never made.
    if (o.protectUntil !== undefined && fetchStartedAt < o.protectUntil) return o
    return null
  }
  const movedSeenAt = o.movedSeenAt ?? fetchStartedAt
  if (fetchStartedAt >= movedSeenAt + graceMs) return null
  return o.movedSeenAt === undefined ? { ...o, movedSeenAt, protectUntil: undefined } : o
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
