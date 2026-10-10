/**
 * @jest-environment node
 */
import { diffSource, eventLabel, NewGameEvent, SourceSnapshot, WatchedItem } from '../diff'
import { checkNewGames, CheckDeps } from '../check'
import { newGamesEmail } from '../email'
import { parseYucataBlog } from '../sources'

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

  it('reports blog posts as posts on the Yucata platform', () => {
    const { events } = diffSource('yucata-blog', {}, [item('post1')], AT)
    expect(events).toMatchObject([{ kind: 'post', platform: 'yucata', id: 'yucata-blog:post1:post' }])
  })
})

describe('eventLabel', () => {
  const base: NewGameEvent = { id: 'x', at: AT, source: 'bga', platform: 'bga', kind: 'new', name: 'X', url: 'u' }
  it('describes each kind', () => {
    expect(eventLabel({ ...base, status: 'alpha' })).toBe('new (alpha)')
    expect(eventLabel({ ...base, status: 'public' })).toBe('new')
    expect(eventLabel({ ...base, kind: 'status', from: 'beta', status: 'public' })).toBe('beta → public')
    expect(eventLabel({ ...base, kind: 'post' })).toBe('blog post')
  })
})

describe('checkNewGames', () => {
  function deps(overrides: Partial<CheckDeps> = {}) {
    const snapshots: Record<string, SourceSnapshot> = { bga: { a: { name: 'A', status: 'alpha' } }, rally: { r: { name: 'R' } } }
    const d = {
      sources: {
        bga: async () => [item('a', 'beta'), item('n', 'alpha')],
        rally: async () => { throw new Error('down') },
        'yucata-blog': async () => [item('p')],
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
    expect(result.baseline).toEqual(['yucata-blog'])
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
          'yucata-blog': async () => [item('p')],
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

describe('newGamesEmail', () => {
  it('groups by source in a fixed order and escapes names', () => {
    const e = (source: NewGameEvent['source'], name: string): NewGameEvent =>
      ({ id: name, at: AT, source, platform: 'yucata', kind: source === 'yucata-blog' ? 'post' : 'new', name, url: 'https://y' })
    const mail = newGamesEmail([e('yucata-blog', 'Post <1>'), e('yucata', 'Game')])
    expect(mail.subject).toBe('🆕 Yucata: 1, Yucata blog: 1')
    expect(mail.html).toContain('Post &lt;1&gt;')
    expect(mail.text.indexOf('Game')).toBeLessThan(mail.text.indexOf('Post'))
  })
})

describe('parseYucataBlog', () => {
  it('keeps published posts and links them by key', () => {
    const items = parseYucataBlog([
      { title: 'Caterpillars is online!', key: 'CaterpillarsBlog', status: 'Published', content: '<p>…</p>' },
      { title: 'Draft', key: 'Draft1', status: 'Draft' },
    ])
    expect(items).toEqual([{ key: 'CaterpillarsBlog', name: 'Caterpillars is online!', url: 'https://www.yucata.de/en/Blog/CaterpillarsBlog' }])
  })

  it('throws on anything but a list', () => {
    expect(() => parseYucataBlog({ error: 'x' })).toThrow('expected a list')
  })
})
