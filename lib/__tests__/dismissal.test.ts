import { presentAt, resolveOpened, judge, protectLaggingGames, parseStoredOpened, nextNotePrompt, openedPlatforms, decideReturnRefresh, Opened, RETURN_GRACE_MS } from '../dismissal'

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

  it('brings back games still waiting for me, keeps played ones dimmed, drops ended ones', () => {
    const opened: Opened = { moved: { openedAt: T - 5000 }, notMoved: { openedAt: T - 5000 }, ended: { openedAt: T - 5000 } }
    expect(resolveOpened(opened, games, T + 1000, here)).toEqual({ moved: { openedAt: T - 5000, movedSeenAt: T + 1000 } })
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

  // app/page.tsx sets protectUntil on return from a lagging platform (OBG,
  // BoardTogether, Boardgamers.space) — this blanket judging must leave
  // that game alone while protected, or it would bring it back on a check
  // that lands before the platform catches up, reading the still-stale
  // myTurn as "nothing happened" instead of "just not confirmed yet".
  it('leaves a protected game untouched even though myTurn would otherwise bring it back', () => {
    const opened: Opened = { moved: { openedAt: T - 5000 }, notMoved: { openedAt: T - 5000, protectUntil: T + 5000 } }
    expect(resolveOpened(opened, games, T + 1000, here)).toEqual({
      moved: { openedAt: T - 5000, movedSeenAt: T + 1000 },
      notMoved: { openedAt: T - 5000, protectUntil: T + 5000 },
    })
  })

  it('brings a protected game back once its protection window has passed and it is still not my turn', () => {
    const opened: Opened = { notMoved: { openedAt: T - 5000, protectUntil: T + 500 } }
    expect(resolveOpened(opened, games, T + 1000, here)).toEqual({})
  })
})

describe('judge', () => {
  const T = 1_000_000

  it('resets a game still showing my turn when unprotected', () => {
    expect(judge({ openedAt: T - 5000 }, { myTurn: true }, T, RETURN_GRACE_MS)).toBeNull()
  })

  it('keeps a game still showing my turn while its protection window holds', () => {
    const o = { openedAt: T - 5000, protectUntil: T + 1000 }
    expect(judge(o, { myTurn: true }, T, RETURN_GRACE_MS)).toBe(o)
  })

  it('resets a game still showing my turn once its protection window has passed', () => {
    const o = { openedAt: T - 5000, protectUntil: T - 1 }
    expect(judge(o, { myTurn: true }, T, RETURN_GRACE_MS)).toBeNull()
  })

  it('confirms the move and clears protectUntil the moment myTurn turns false, protected or not', () => {
    const o = { openedAt: T - 5000, protectUntil: T + 1000 }
    expect(judge(o, { myTurn: false }, T, RETURN_GRACE_MS)).toEqual({ openedAt: T - 5000, movedSeenAt: T, protectUntil: undefined })
  })

  it('drops a game that has ended, even while protected', () => {
    const o = { openedAt: T - 5000, protectUntil: T + 1000 }
    expect(judge(o, undefined, T, RETURN_GRACE_MS)).toBeNull()
  })
})

describe('protectLaggingGames', () => {
  const T = 1_000_000

  it('sets protectUntil on the given ids only', () => {
    const opened: Opened = { a: { openedAt: T - 1000 }, b: { openedAt: T - 1000 } }
    expect(protectLaggingGames(opened, ['a'], T + 5000)).toEqual({
      a: { openedAt: T - 1000, protectUntil: T + 5000 },
      b: { openedAt: T - 1000 },
    })
  })

  it('extends an existing protectUntil instead of shortening it', () => {
    const opened: Opened = { a: { openedAt: T - 1000, protectUntil: T + 10_000 } }
    expect(protectLaggingGames(opened, ['a'], T + 5000)).toBe(opened) // no change — already protected further out
    expect(protectLaggingGames(opened, ['a'], T + 20_000)).toEqual({ a: { openedAt: T - 1000, protectUntil: T + 20_000 } })
  })

  it('ignores an id that is not actually opened', () => {
    const opened: Opened = { a: { openedAt: T - 1000 } }
    expect(protectLaggingGames(opened, ['missing'], T + 5000)).toBe(opened)
  })

  it('is a no-op for an empty id list', () => {
    const opened: Opened = { a: { openedAt: T - 1000 } }
    expect(protectLaggingGames(opened, [], T + 5000)).toBe(opened)
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
