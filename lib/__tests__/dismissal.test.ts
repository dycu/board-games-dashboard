import { presentAt, resolveOpened, judge, parseStoredOpened, nextNotePrompt, openedPlatforms, decideReturnRefresh, stillShownAsOpened, justRegainedTurn, Opened, RETURN_GRACE_MS } from '../dismissal'

describe('presentAt', () => {
  it('counts a time after returning', () => {
    expect(presentAt(200, { returnedAt: 100, leftAt: null })).toBe(true)
  })

  it('does not count a time before the last return (may have been away)', () => {
    expect(presentAt(50, { returnedAt: 100, leftAt: null })).toBe(false)
  })

  it('does not count a time after leaving again', () => {
    expect(presentAt(300, { returnedAt: 100, leftAt: 250 })).toBe(false)
  })

  it('counts a time before leaving again', () => {
    expect(presentAt(200, { returnedAt: 100, leftAt: 250 })).toBe(true)
  })

  it('counts any time when here since the page loaded', () => {
    expect(presentAt(50, { returnedAt: 0, leftAt: null })).toBe(true)
  })
})

describe('resolveOpened', () => {
  const T = 1_000_000
  const here = { returnedAt: T, leftAt: null }
  const games = [{ id: 'moved', myTurn: false }, { id: 'notMoved', myTurn: true }]

  it('keeps everything for a fetch made while away', () => {
    const opened: Opened = { moved: { openedAt: T - 5000 }, notMoved: { openedAt: T - 5000 } }
    expect(resolveOpened(opened, games, T - 1, here)).toBe(opened)
  })

  it('stops dimming a game still waiting for me once its grace window has passed (but keeps watching it), keeps a played one dimmed, drops an ended one', () => {
    const opened: Opened = { moved: { openedAt: T - 5000 }, notMoved: { openedAt: T - RETURN_GRACE_MS - 1 }, ended: { openedAt: T - 5000 } }
    expect(resolveOpened(opened, games, T + 1000, here)).toEqual({
      moved: { openedAt: T - 5000, movedSeenAt: T + 1000 },
      notMoved: { openedAt: T - RETURN_GRACE_MS - 1, dimExpired: true },
    })
  })

  it('drops a played game once the grace period since its move was seen is over', () => {
    const opened: Opened = { moved: { openedAt: T - 5000, movedSeenAt: T + 1000 } }
    expect(resolveOpened(opened, games, T + 1000 + RETURN_GRACE_MS - 1, here)).toEqual(opened)
    expect(resolveOpened(opened, games, T + 1000 + RETURN_GRACE_MS, here)).toEqual({})
  })

  // Clicking Next while the refresh after a return is still running: that
  // refresh started before the new game was opened, so it can't show my move
  it('does not touch a game opened after the fetch started', () => {
    const presence = { returnedAt: T, leftAt: T + 3000 }
    const opened: Opened = { notMoved: { openedAt: T + 3000 } }
    expect(resolveOpened(opened, games, T + 100, presence)).toEqual(opened)
  })

  // Back on the dashboard by a fresh load (not Back): no return time is known,
  // and the played game must still stay dimmed rather than vanish
  it('keeps a played game dimmed after a fresh page load', () => {
    const opened: Opened = { moved: { openedAt: T - 60_000 } }
    expect(resolveOpened(opened, games, T, { returnedAt: 0, leftAt: null })).toEqual({ moved: { openedAt: T - 60_000, movedSeenAt: T } })
  })

  // Every platform gets RETURN_GRACE_MS from when the game was opened
  // before a lingering myTurn:true is trusted (not just a curated list of
  // known-lagging ones — see judge()'s own comment) — computed straight
  // from openedAt rather than a live "you just returned" event, so it
  // holds even when resolveOpened is first called from a cold reload
  // (e.g. the OS silently reloading a backgrounded mobile tab) that never
  // ran any return-detection code.
  it('leaves a just-opened game untouched (not yet past its grace window) even though myTurn would otherwise bring it back', () => {
    const opened: Opened = { moved: { openedAt: T - 5000 }, notMoved: { openedAt: T - 5000 } }
    expect(resolveOpened(opened, games, T + 1000, here)).toEqual({
      moved: { openedAt: T - 5000, movedSeenAt: T + 1000 },
      notMoved: { openedAt: T - 5000 },
    })
  })

  it('stops dimming a game once its grace window (from openedAt) has passed and it is still not my turn, without dropping it', () => {
    const opened: Opened = { notMoved: { openedAt: T - RETURN_GRACE_MS } }
    expect(resolveOpened(opened, games, T + 1, here)).toEqual({ notMoved: { openedAt: T - RETURN_GRACE_MS, dimExpired: true } })
  })

  // A tab rarely judged "present" (an infrequently-foregrounded mobile one,
  // say) must still stop dimming a long-stale game once its grace window
  // has passed — dimExpired is a pure elapsed-time check, so it shouldn't
  // need a trusted fetch the way confirming a move does
  it('still expires the display grace on a fetch made while away, unlike confirming a move', () => {
    const away = { returnedAt: T, leftAt: T - 1 }
    const opened: Opened = { moved: { openedAt: T - RETURN_GRACE_MS - 1 }, notMoved: { openedAt: T - RETURN_GRACE_MS - 1 } }
    expect(resolveOpened(opened, games, T - 1, away)).toEqual({
      moved: { openedAt: T - RETURN_GRACE_MS - 1 },
      notMoved: { openedAt: T - RETURN_GRACE_MS - 1, dimExpired: true },
    })
  })

  // A platform laggier than graceMs itself (the original reason Boardgamers.space
  // was on the old curated list) must not lose the move's confirmation just
  // because the display grace ran out first — judge() keeps a dimExpired game
  // in `opened` precisely so this can still happen whenever it does
  it('still confirms a move on a dimExpired game once the platform finally catches up, however late', () => {
    const opened: Opened = { notMoved: { openedAt: T - RETURN_GRACE_MS, dimExpired: true } }
    expect(resolveOpened(opened, games, T + 1, { returnedAt: T, leftAt: null })).toBe(opened) // still myTurn: true, same object, nothing to confirm yet
    const laterGames = [{ id: 'notMoved', myTurn: false }]
    expect(resolveOpened(opened, laterGames, T + 2 * RETURN_GRACE_MS, here)).toEqual({
      notMoved: { openedAt: T - RETURN_GRACE_MS, dimExpired: true, movedSeenAt: T + 2 * RETURN_GRACE_MS },
    })
  })

  // A game whose opponent replies fast: myTurn flips back true before this
  // record's own post-move grace (from movedSeenAt) runs out. Once that
  // grace does run out, the stale confirmation must stop pinning the game
  // as "opened" forever across every later round, even though myTurn has
  // been true again the whole time
  it('drops a confirmed move once its own grace is over, even though myTurn flipped back true in the meantime', () => {
    const opened: Opened = { notMoved: { openedAt: T - 500_000, movedSeenAt: T - RETURN_GRACE_MS - 1 } }
    expect(resolveOpened(opened, games, T, here)).toEqual({})
  })

  // An explicit manual refresh (not an automatic poll) can ask to judge a
  // still-within-grace game right now instead of waiting out the rest of
  // RETURN_GRACE_MS — it's only ever asking "does it still look freshly
  // opened", never confirming a move (that's still movedSeenAt, untouched
  // by this and still gated on a trusted fetch below), so it's safe even
  // this early.
  it('expires the display grace immediately on an explicit manual refresh, well before the window is up', () => {
    const opened: Opened = { notMoved: { openedAt: T - 5000 } } // nowhere near RETURN_GRACE_MS yet
    expect(resolveOpened(opened, games, T + 1, here, RETURN_GRACE_MS, true)).toEqual({
      notMoved: { openedAt: T - 5000, dimExpired: true },
    })
  })

  it('does not let an immediate manual refresh falsely confirm a move on an untrusted fetch', () => {
    const away = { returnedAt: T, leftAt: T - 1 }
    const opened: Opened = { moved: { openedAt: T - 5000 } }
    expect(resolveOpened(opened, games, T - 1, away, RETURN_GRACE_MS, true)).toEqual(opened)
  })
})

describe('judge', () => {
  const T = 1_000_000

  it('keeps a game still showing my turn within its grace window from openedAt', () => {
    const o = { openedAt: T - 1000 }
    expect(judge(o, { myTurn: true }, T, RETURN_GRACE_MS)).toBe(o)
  })

  it('stops dimming (but does not drop) a game still showing my turn once its grace window from openedAt has passed', () => {
    const o = { openedAt: T - RETURN_GRACE_MS }
    expect(judge(o, { myTurn: true }, T + 1, RETURN_GRACE_MS)).toEqual({ openedAt: T - RETURN_GRACE_MS, dimExpired: true })
  })

  it('leaves an already-dimExpired game untouched while still my turn, rather than re-wrapping it every fetch', () => {
    const o = { openedAt: T - RETURN_GRACE_MS, dimExpired: true }
    expect(judge(o, { myTurn: true }, T + 1, RETURN_GRACE_MS)).toBe(o)
  })

  it('confirms the move the moment myTurn turns false', () => {
    const o = { openedAt: T - 1000 }
    expect(judge(o, { myTurn: false }, T, RETURN_GRACE_MS)).toEqual({ openedAt: T - 1000, movedSeenAt: T })
  })

  it('drops a game that has ended, even within its grace window', () => {
    expect(judge({ openedAt: T - 1000 }, undefined, T, RETURN_GRACE_MS)).toBeNull()
  })
})

describe('stillShownAsOpened', () => {
  it('stays opened while a not-yet-confirmed move is still within its display grace', () => {
    expect(stillShownAsOpened({ openedAt: 0 }, { myTurn: true })).toBe(true)
  })

  it('stops looking opened once dimExpired, with no move confirmed yet', () => {
    expect(stillShownAsOpened({ openedAt: 0, dimExpired: true }, { myTurn: true })).toBe(false)
  })

  it('stays opened for the note prompt right after a confirmed move, while still waiting on the opponent', () => {
    expect(stillShownAsOpened({ openedAt: 0, movedSeenAt: 100 }, { myTurn: false })).toBe(true)
  })

  // The opponent replied fast enough that myTurn is true again well within
  // the same grace window a slow platform would still be given the benefit
  // of the doubt in — this is what was reported live as a real turn stuck
  // looking "opened" because the opponent moved quickly.
  it('stops looking opened the moment myTurn is true again after a confirmed move, regardless of how little time has passed', () => {
    expect(stillShownAsOpened({ openedAt: 0, movedSeenAt: 100 }, { myTurn: true })).toBe(false)
  })

  it('stays opened for a game no longer in the live list — nothing says it is my turn again', () => {
    expect(stillShownAsOpened({ openedAt: 0, movedSeenAt: 100 }, undefined)).toBe(true)
  })
})

describe('justRegainedTurn', () => {
  it('names a game that left the dismissed set with its turn back on', () => {
    const prev = new Set(['bga:1'])
    const next = new Set<string>()
    const games = [{ id: 'bga:1', myTurn: true }]
    expect(justRegainedTurn(prev, next, games)).toEqual(['bga:1'])
  })

  it('ignores a game that left the dismissed set but is still not my turn', () => {
    const prev = new Set(['bga:1'])
    const next = new Set<string>()
    const games = [{ id: 'bga:1', myTurn: false }]
    expect(justRegainedTurn(prev, next, games)).toEqual([])
  })

  it('ignores a game that is still dismissed', () => {
    const prev = new Set(['bga:1'])
    const next = new Set(['bga:1'])
    const games = [{ id: 'bga:1', myTurn: true }]
    expect(justRegainedTurn(prev, next, games)).toEqual([])
  })

  it('ignores a game missing from the live list entirely', () => {
    const prev = new Set(['bga:1'])
    const next = new Set<string>()
    expect(justRegainedTurn(prev, next, [])).toEqual([])
  })

  it('reports nothing when nothing was previously dismissed', () => {
    expect(justRegainedTurn(new Set(), new Set(), [{ id: 'bga:1', myTurn: true }])).toEqual([])
  })
})

describe('nextNotePrompt', () => {
  it('picks a game whose move is confirmed', () => {
    const opened: Opened = { a: { openedAt: 1 }, b: { openedAt: 1, movedSeenAt: 2 } }
    expect(nextNotePrompt(opened)).toBe('b')
  })

  it('ignores a game only clicked open, not yet confirmed back on the dashboard', () => {
    const opened: Opened = { a: { openedAt: 1 } }
    expect(nextNotePrompt(opened)).toBeNull()
  })

  it('skips a game already prompted (saved, deleted or skipped) since it was opened', () => {
    const opened: Opened = { a: { openedAt: 1, movedSeenAt: 2, notePrompted: true } }
    expect(nextNotePrompt(opened)).toBeNull()
  })

  it('stays skipped across a reload — notePrompted is read from the (persisted) opened record itself', () => {
    // Same shape readStoredOpened() would hand back after JSON round-tripping
    const opened: Opened = JSON.parse(JSON.stringify({ a: { openedAt: 1, movedSeenAt: 2, notePrompted: true } }))
    expect(nextNotePrompt(opened)).toBeNull()
  })

  it('returns null when nothing is confirmed', () => {
    expect(nextNotePrompt({})).toBeNull()
  })
})

describe('openedPlatforms', () => {
  it('extracts the distinct platforms from the opened games\' ids', () => {
    const opened: Opened = { 'bga:1': { openedAt: 1 }, 'bga:2': { openedAt: 1 }, 'rally:3': { openedAt: 1 } }
    expect(openedPlatforms(opened)).toEqual(['bga', 'rally'])
  })

  it('returns an empty list when nothing is opened', () => {
    expect(openedPlatforms({})).toEqual([])
  })
})

describe('decideReturnRefresh', () => {
  it('refreshes everything once the auto-refresh interval has lapsed, even with a game open', () => {
    const opened: Opened = { 'bga:1': { openedAt: 1 } }
    expect(decideReturnRefresh(opened, 400_000, 300_000)).toEqual({ kind: 'full' })
  })

  it('refreshes only the opened game(s) platform when the interval has not lapsed yet', () => {
    const opened: Opened = { 'bga:1': { openedAt: 1 }, 'rally:2': { openedAt: 1 } }
    expect(decideReturnRefresh(opened, 5_000, 300_000)).toEqual({ kind: 'platforms', platforms: ['bga', 'rally'] })
  })

  it('does nothing when the interval has not lapsed and nothing is open', () => {
    expect(decideReturnRefresh({}, 5_000, 300_000)).toEqual({ kind: 'none' })
  })

  it('treats auto-refresh being off (intervalMs 0) as never "lapsed"', () => {
    const opened: Opened = { 'bga:1': { openedAt: 1 } }
    expect(decideReturnRefresh(opened, 999_999, 0)).toEqual({ kind: 'platforms', platforms: ['bga'] })
    expect(decideReturnRefresh({}, 999_999, 0)).toEqual({ kind: 'none' })
  })
})

describe('parseStoredOpened', () => {
  it('reads the current format', () => {
    expect(parseStoredOpened('{"a":{"openedAt":5}}')).toEqual({ a: { openedAt: 5 } })
  })

  it('reads the old list of ids', () => {
    expect(parseStoredOpened('["a","b"]')).toEqual({ a: { openedAt: 0 }, b: { openedAt: 0 } })
  })

  it('ignores junk', () => {
    expect(parseStoredOpened(null)).toEqual({})
    expect(parseStoredOpened('nope')).toEqual({})
  })
})
