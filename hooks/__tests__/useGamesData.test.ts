import { renderHook, act, waitFor } from '@testing-library/react'
import { mergePlatformRefresh, departureCheckErrors, useGamesData } from '../useGamesData'
import { Game } from '@/lib/types'

function makeGame(platform: Game['platform'], id: string): Game {
  return {
    id: `${platform}:${id}`,
    platform,
    gameName: 'Test Game',
    myTurn: true,
    lastMoveAt: new Date(),
    lastMoveAgo: '1h ago',
    urgent: false,
    gameUrl: `https://example.com/game/${id}`,
    platformUrl: 'https://example.com',
    players: [],
  }
}

describe('mergePlatformRefresh', () => {
  it('keeps every other platform untouched, replacing only the refreshed one', () => {
    const untouchedRallyGame = makeGame('rally', '2')
    const previous = {
      games: [makeGame('bga', '1'), untouchedRallyGame],
      errors: [{ platform: 'hansa' as const, error: 'down' }],
      fetchedAt: 'old',
      platforms: ['bga', 'rally', 'hansa'] as Game['platform'][],
    }
    const fresh = [makeGame('bga', '1'), makeGame('bga', '3')]
    const merged = mergePlatformRefresh(previous, ['bga'], fresh, [], 'new')

    expect(merged.games).toEqual([untouchedRallyGame, ...fresh])
    expect(merged.errors).toEqual([{ platform: 'hansa', error: 'down' }])
    expect(merged.fetchedAt).toBe('new')
    expect(merged.platforms).toEqual(['bga', 'rally', 'hansa']) // the filter bar keeps every configured platform
  })

  it('replaces a previous error for the refreshed platform once it succeeds', () => {
    const previous = {
      games: [],
      errors: [{ platform: 'bga' as const, error: 'timed out' }],
      fetchedAt: 'old',
      platforms: ['bga'] as Game['platform'][],
    }
    const merged = mergePlatformRefresh(previous, ['bga'], [makeGame('bga', '1')], [], 'new')
    expect(merged.errors).toEqual([])
  })

  it('falls back to a plain full result when there is nothing cached to merge into', () => {
    const fresh = [makeGame('bga', '1')]
    const merged = mergePlatformRefresh(null, ['bga'], fresh, [], 'new')
    expect(merged).toEqual({ games: fresh, errors: [], fetchedAt: 'new', platforms: ['bga'] })
  })
})

describe('departureCheckErrors', () => {
  it('treats every platform outside the refresh as if it had errored, so it is never judged departed', () => {
    const result = departureCheckErrors([], ['bga', 'rally', 'hansa'], ['bga'])
    expect(result).toEqual([
      { platform: 'rally', error: 'not fetched this round' },
      { platform: 'hansa', error: 'not fetched this round' },
    ])
  })

  it('keeps a real error for the refreshed platform alongside the synthetic ones', () => {
    const result = departureCheckErrors([{ platform: 'bga', error: 'boom' }], ['bga', 'rally'], ['bga'])
    expect(result).toEqual([
      { platform: 'bga', error: 'boom' },
      { platform: 'rally', error: 'not fetched this round' },
    ])
  })

  it('adds nothing extra when every known platform was part of this refresh', () => {
    expect(departureCheckErrors([], ['bga'], ['bga'])).toEqual([])
  })
})

// A controllable fake SSE stream: the test pushes/ends events on its own
// schedule instead of a real fetch resolving them, so two concurrent
// requests' relative timing can be driven deterministically.
function makeChannel() {
  const pending: (() => { done: boolean; value?: Uint8Array })[] = []
  let waiting: (() => void) | null = null
  const push = (next: () => { done: boolean; value?: Uint8Array }) => {
    pending.push(next)
    waiting?.()
  }
  return {
    send: (obj: object) => push(() => ({ done: false, value: new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`) })),
    end: () => push(() => ({ done: true, value: undefined })),
    reader: {
      read: () => new Promise<{ done: boolean; value?: Uint8Array }>(resolve => {
        const tryNext = () => {
          if (pending.length > 0) resolve(pending.shift()!())
          else waiting = () => { waiting = null; tryNext() }
        }
        tryNext()
      }),
    },
  }
}

describe('useGamesData concurrency', () => {
  let channels: ReturnType<typeof makeChannel>[]
  let signals: AbortSignal[]

  beforeEach(() => {
    localStorage.clear()
    channels = []
    signals = []
    global.fetch = jest.fn((_url: string, init?: RequestInit) => {
      const ch = makeChannel()
      channels.push(ch)
      signals.push(init!.signal!)
      return Promise.resolve({ ok: true, body: { getReader: () => ch.reader } } as unknown as Response)
    }) as unknown as typeof fetch
  })

  it('lets two disjoint platform-scoped refreshes run to completion without aborting each other', async () => {
    const { result } = renderHook(() => useGamesData())
    await waitFor(() => expect(channels.length).toBe(1)) // the initial full fetch on mount

    act(() => { result.current.triggerRefresh(true, ['bga']) })
    await waitFor(() => expect(channels.length).toBe(2))
    act(() => { result.current.triggerRefresh(true, ['boardtogether']) })
    await waitFor(() => expect(channels.length).toBe(3))

    expect(signals[1].aborted).toBe(false) // bga's own fetch
    expect(signals[2].aborted).toBe(false) // boardtogether's own fetch, not aborting bga's

    expect(result.current.isRefreshing).toBe(true)
    act(() => { channels[1].send({ type: 'start', platforms: ['bga'] }); channels[1].send({ type: 'done', fetchedAt: 'a' }); channels[1].end() })
    await waitFor(() => expect(result.current.isRefreshing).toBe(true)) // boardtogether's own fetch still open
    act(() => { channels[2].send({ type: 'start', platforms: ['boardtogether'] }); channels[2].send({ type: 'done', fetchedAt: 'b' }); channels[2].end() })
    await waitFor(() => expect(result.current.isRefreshing).toBe(false))
  })

  it('aborts an earlier refresh only when a new one targets an overlapping platform', async () => {
    const { result } = renderHook(() => useGamesData())
    await waitFor(() => expect(channels.length).toBe(1))

    act(() => { result.current.triggerRefresh(true, ['bga']) })
    await waitFor(() => expect(channels.length).toBe(2))
    act(() => { result.current.triggerRefresh(true, ['bga']) }) // same platform again
    await waitFor(() => expect(channels.length).toBe(3))

    expect(signals[1].aborted).toBe(true) // the first bga fetch was superseded
    expect(signals[2].aborted).toBe(false)
  })
})
