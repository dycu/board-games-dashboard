/**
 * @jest-environment node
 */
import { diffSource, eventLabel, groupEventsByDay, formatEventsForCopy, NewGameEvent, SourceSnapshot, WatchedItem } from '../diff'
import { checkNewGames, CheckDeps } from '../check'
import { newGamesEmail } from '../email'

const AT = '2026-10-09T07:00:00.000Z'
const item = (key: string, status?: string): WatchedItem => ({ key, name: key.toUpperCase(), url: `https://x/${key}`, ...(status && { status }) })

describe('diffSource', () => {
  it('only records the first check of a source', () => {
    const { snapshot, events } = diffSource('bga', null, [item('a', 'public'), item('b', 'alpha')], AT)
    expect(events).toEqual([])
    expect(snapshot).toEqual({ a: { name: 'A', status: 'public' }, b: { name: 'B', status: 'alpha' } })
  })

  it('reports games it has not seen before', () => {
    const prev: SourceSnapshot = { a: { name: 'A', status: 'public' } }
    const { events } = diffSource('bga', prev, [item('a', 'public'), item('b', 'alpha')], AT)
    expect(events).toEqual([{ id: 'bga:b:new', at: AT, source: 'bga', platform: 'bga', kind: 'new', name: 'B', url: 'https://x/b', status: 'alpha' }])
  })

  it('reports a move to a later stage, not a move back', () => {
    const prev: SourceSnapshot = { a: { name: 'A', status: 'alpha' }, b: { name: 'B', status: 'public' } }
    const { events, snapshot } = diffSource('bga', prev, [item('a', 'beta'), item('b', 'beta')], AT)
    expect(events).toMatchObject([{ id: 'bga:a:status:beta', kind: 'status', from: 'alpha', status: 'beta' }])
    expect(snapshot.b.status).toBe('beta')
  })

  it('keeps games that dropped out of the list, so they are not new when they return', () => {
    const prev: SourceSnapshot = { a: { name: 'A' }, b: { name: 'B' } }
    const missing = diffSource('rally', prev, [item('a')], AT)
    expect(missing.snapshot.b).toEqual({ name: 'B' })
    expect(diffSource('rally', missing.snapshot, [item('a'), item('b')], AT).events).toEqual([])
  })
})

describe('eventLabel', () => {
  const base: NewGameEvent = { id: 'x', at: AT, source: 'bga', platform: 'bga', kind: 'new', name: 'X', url: 'u' }
  it('describes each kind', () => {
    expect(eventLabel({ ...base, status: 'alpha' })).toBe('new (alpha)')
    expect(eventLabel({ ...base, status: 'public' })).toBe('new')
    expect(eventLabel({ ...base, kind: 'status', from: 'beta', status: 'public' })).toBe('beta → public')
  })
})

describe('checkNewGames', () => {
  function deps(overrides: Partial<CheckDeps> = {}) {
    const snapshots: Record<string, SourceSnapshot> = { bga: { a: { name: 'A', status: 'alpha' } }, rally: { r: { name: 'R' } } }
    const d = {
      sources: {
        bga: async () => [item('a', 'beta'), item('n', 'alpha')],
        rally: async () => { throw new Error('down') },
      },
      getSnapshot: jest.fn(async (s: string) => snapshots[s] ?? null),
      setSnapshot: jest.fn(async () => {}),
      addEvents: jest.fn(async () => {}),
      sendEmail: jest.fn(async () => ({ sent: true })),
      ...overrides,
    }
    return d
  }

  it('saves events and emails them; a failing source keeps its snapshot', async () => {
    const d = deps()
    const result = await checkNewGames(d, new Date(AT))
    expect(result.events.map(e => e.id).sort()).toEqual(['bga:a:status:beta', 'bga:n:new'])
    expect(result.errors).toEqual({ rally: 'down' })
    expect(result.baseline).toEqual([])
    expect(d.setSnapshot).not.toHaveBeenCalledWith('rally', expect.anything())
    expect(d.addEvents).toHaveBeenCalledTimes(1)
    expect(d.sendEmail).toHaveBeenCalledWith('🆕 BGA: 2', expect.stringContaining('N (new (alpha))'), expect.stringContaining('<a href="https://x/n">N</a>'))
  })

  it('sends nothing when nothing changed', async () => {
    const d = deps({ sources: { bga: async () => [item('a', 'alpha')] } })
    const result = await checkNewGames(d, new Date(AT))
    expect(result.events).toEqual([])
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(d.addEvents).not.toHaveBeenCalled()
  })

  it('does not let a hung source block the others from being checked and emailed', async () => {
    jest.useFakeTimers()
    try {
      const d = deps({
        sources: {
          bga: async () => [item('a', 'beta'), item('n', 'alpha')],
          rally: () => new Promise(() => {}), // never settles
        },
      })
      const resultPromise = checkNewGames(d, new Date(AT))
      await jest.advanceTimersByTimeAsync(25_000)
      const result = await resultPromise
      expect(result.errors.rally).toMatch(/timed out/)
      expect(result.events.map(e => e.id).sort()).toEqual(['bga:a:status:beta', 'bga:n:new'])
      expect(d.sendEmail).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('groupEventsByDay', () => {
  const e = (id: string, at: string): NewGameEvent => ({ id, at, source: 'bga', platform: 'bga', kind: 'new', name: id, url: 'https://x' })
  const now = new Date('2026-11-18T12:00:00.000Z')

  it('labels today and yesterday, grouping their events together', () => {
    const groups = groupEventsByDay([
      e('a', '2026-11-18T07:00:00.000Z'),
      e('b', '2026-11-18T19:00:00.000Z'),
      e('c', '2026-11-17T07:00:00.000Z'),
    ], now)
    expect(groups.map(g => g.label)).toEqual(['Today', 'Yesterday'])
    expect(groups[0].events.map(ev => ev.id)).toEqual(['a', 'b'])
    expect(groups[1].events.map(ev => ev.id)).toEqual(['c'])
  })

  it('uses a calendar-date label for anything older than yesterday', () => {
    const groups = groupEventsByDay([e('a', '2026-11-10T07:00:00.000Z')], now)
    expect(groups[0].label).not.toBe('Today')
    expect(groups[0].label).not.toBe('Yesterday')
    expect(groups[0].events).toHaveLength(1)
  })

  it('preserves the newest-first order of both days and events within a day', () => {
    const groups = groupEventsByDay([
      e('newest', '2026-11-18T19:00:00.000Z'),
      e('older-same-day', '2026-11-18T07:00:00.000Z'),
      e('yesterday', '2026-11-17T07:00:00.000Z'),
    ], now)
    expect(groups.map(g => g.dateKey)).toEqual([groups[0].dateKey, groups[1].dateKey])
    expect(groups[0].events.map(ev => ev.id)).toEqual(['newest', 'older-same-day'])
  })

  it('returns nothing for an empty list', () => {
    expect(groupEventsByDay([], now)).toEqual([])
  })
})

describe('formatEventsForCopy', () => {
  it('writes one readable line per event, with the full platform name', () => {
    const text = formatEventsForCopy([
      { id: 'a', at: AT, source: 'bga', platform: 'bga', kind: 'new', name: 'Hundo', url: 'https://x/hundo', status: 'alpha' },
      { id: 'b', at: AT, source: 'rally', platform: 'rally', kind: 'status', name: 'Maria', url: 'https://x/maria', status: 'public', from: 'beta' },
    ])
    expect(text).toBe(
      'BGA: Hundo (new (alpha)) — https://x/hundo\n' +
      'Rally the Troops: Maria (beta → public) — https://x/maria'
    )
  })

  it('returns an empty string for an empty list', () => {
    expect(formatEventsForCopy([])).toBe('')
  })
})

describe('newGamesEmail', () => {
  it('groups by source in a fixed order and escapes names', () => {
    const e = (source: NewGameEvent['source'], name: string): NewGameEvent =>
      ({ id: name, at: AT, source, platform: 'yucata', kind: 'new', name, url: 'https://y' })
    const mail = newGamesEmail([e('yucata', 'Game <1>'), e('rally', 'Other')])
    expect(mail.subject).toBe('🆕 Rally the Troops: 1, Yucata: 1')
    expect(mail.html).toContain('Game &lt;1&gt;')
    expect(mail.text.indexOf('Other')).toBeLessThan(mail.text.indexOf('Game'))
  })
})
