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
  dimExpired?: boolean   // its display grace (from openedAt) is over with no move seen yet — stop dimming it, but keep watching (see judge())
}

export type Opened = Record<string, OpenedGame>

export const RETURN_GRACE_MS = 5 * 60 * 1000

// Whether an opened game should still display as "opened" (dimmed) right
// now. A dimExpired game with no confirmed move yet is still being watched
// by judge() in case a laggy platform catches up later, but it should look
// like a normal card again in the meantime, not stay stuck dimmed — unlike
// one whose move IS confirmed (movedSeenAt set), which normally stays
// dimmed for the note-prompt regardless. Except: once the *current* fetch
// already shows myTurn true again, that's a brand new turn — the opponent
// replied, possibly well within the same grace window a slow platform
// would still be given the benefit of the doubt in — and there's nothing
// left to wait on. The record itself isn't dropped here (the note prompt
// for the round that just finished still needs it — see judge()'s own
// movedSeenAt-expiry check), only the display stops treating it as opened.
export function stillShownAsOpened(o: OpenedGame, game: { myTurn: boolean } | undefined): boolean {
  if (o.movedSeenAt === undefined) return !o.dimExpired
  return !game?.myTurn
}

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
  immediate = false,
): Opened {
  // Trust (for confirming a move actually happened) still needs a fetch made
  // while actually back on the dashboard, so a background/stale fetch can't
  // predate the move. But the display grace timing out — stop treating a
  // game as freshly opened once RETURN_GRACE_MS has passed, even with no
  // move seen yet (dimExpired) — is a pure elapsed-time check that doesn't
  // need that same trust, and gating it the same way meant a game stayed
  // stuck looking "opened" forever on a tab rarely judged "present" (an
  // infrequently-foregrounded mobile tab, say) instead of going back to
  // looking like a normal card after its grace window passed.
  const trusted = presentAt(fetchStartedAt, presence)
  const byId = new Map(games.map(g => [g.id, g]))
  const next: Opened = {}
  let changed = false
  for (const [id, o] of Object.entries(opened)) {
    const kept = judge(o, byId.get(id), fetchStartedAt, graceMs, trusted, immediate)
    if (kept) next[id] = kept
    if (kept !== o) changed = true
  }
  return changed ? next : opened
}

// One opened game's own verdict for a given fetch — resolveOpened's inner
// loop. Exported in its own right for direct unit tests of its branches.
//
// A lingering myTurn:true within graceMs of when the game was *opened*
// isn't trusted as "nothing happened, bring it back" — only once that
// window has passed. This used to apply only to a curated list of
// platforms known to lag right after a move (OBG, BoardTogether,
// Boardgamers.space) — Rally the Troops turning up with the exact same
// symptom is what gave up on that list: apparently any platform can be
// slow to reflect a move occasionally, so every one of them gets the same
// benefit of the doubt now rather than this growing one entry at a time.
// The cost is a game merely glanced at (opened, not actually played)
// staying dimmed up to graceMs instead of resetting instantly — a much
// smaller problem than this one kept being.
//
// Computed straight from openedAt — already on the persisted record —
// rather than from a live "you just returned" event, so it holds up no
// matter how resolveOpened gets called: a full refresh, a scoped one, an
// unrelated periodic tick, or the first fetch after the OS silently
// reloaded a backgrounded tab (which isn't a back/forward navigation —
// see lib/navigation.ts — so it carries none of the live return-detection
// state a focus/visibilitychange handler would have set up).
//
// Once that window passes with myTurn still true, the record used to be
// dropped outright — which stopped the card looking fake-dimmed forever,
// but on a platform laggier than graceMs itself (Boardgamers.space's own
// original reason for existing in that curated list) it meant the move's
// confirmation, and the note-prompt popup riding on it, was lost for
// good the moment the window closed, with no way to ever catch up.
// dimExpired splits the two concerns apart instead: it stops the card
// being treated as freshly opened (resolveOpened's caller excludes a
// dimExpired, not-yet-confirmed game from the dimmed set, so it shows
// normally again rather than looking stuck) while the record itself stays
// in `opened` and keeps being judged on every fetch, so a move that
// genuinely happened still gets its movedSeenAt — and the note-prompt
// it enables below — whenever the platform eventually catches up, however
// long that takes. The record is only actually dropped once the game
// itself is gone, or once a confirmed move's own post-move grace expires.
export function judge(o: OpenedGame, game: { myTurn: boolean } | undefined, fetchStartedAt: number, graceMs: number, trusted = true, immediate = false): OpenedGame | null {
  // Opened after this fetch started: it can't show my move yet
  if (fetchStartedAt < o.openedAt) return o
  // Gone (ended): no longer opened
  if (!game) return null
  // A confirmed move's own post-move grace (for the note prompt) is on its
  // own clock, independent of myTurn's *current* value: if the opponent
  // replies fast enough that myTurn flips back to true again before that
  // clock runs out, the game.myTurn branch below never looks at movedSeenAt
  // at all (it only sets dimExpired), so without this check the record —
  // and the stuck "opened" label it drives in the caller's dismissed set,
  // since that still treats any movedSeenAt as reason enough to keep
  // dimming — would never expire: myTurn flipping true then false then
  // true again, every round, forever, with no fetch ever reaching the
  // game.myTurn === false branch's own expiry check again.
  if (o.movedSeenAt !== undefined && fetchStartedAt >= o.movedSeenAt + graceMs) return null
  if (game.myTurn) {
    // `immediate` (an explicit manual refresh, not an automatic poll) skips
    // waiting out the rest of the grace window: dimExpired is purely a
    // display concern, never a claim that the move was seen (that's still
    // movedSeenAt, gated on `trusted` below, untouched by this), so showing
    // it plainly again sooner carries none of the "might predate the move"
    // risk the grace window itself guards against — it only changes how
    // soon a glanced-at, nothing-happened game stops looking dimmed when
    // asked to check right now, not whether a move gets falsely confirmed.
    if (!immediate && fetchStartedAt < o.openedAt + graceMs) return o
    return o.dimExpired ? o : { ...o, dimExpired: true }
  }
  // Might predate the move (fetch not made while actually back) — wait for
  // one that is, rather than confirm the move on unproven data
  if (!trusted) return o
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

// Which games just flipped from not-my-turn to my-turn — the one signal
// the grid itself never raises on its own: an opponent's move landing,
// whether or not the game was ever opened/dismissed in this session.
// Diffed from each game's own previous myTurn value, not from `dismissed`:
// a dismissed game regaining its turn is just a special case of this same
// transition (judge() stops treating it as opened the moment myTurn is
// true again — see stillShownAsOpened), not a separate thing to detect.
// A game missing from `prevMyTurn` entirely (just appeared, or this is the
// very first fetch) never counts — there's no actual transition to report,
// just a game the caller hasn't seen before.
export function justGainedTurn(prevMyTurn: Map<string, boolean>, games: { id: string; myTurn: boolean }[]): string[] {
  return games.filter(g => g.myTurn && prevMyTurn.get(g.id) === false).map(g => g.id)
}
