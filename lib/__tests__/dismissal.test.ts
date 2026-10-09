import { presentAt, resolveOpened, parseStoredOpened, Opened, RETURN_GRACE_MS } from '../dismissal'

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
