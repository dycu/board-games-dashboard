import { renderHook, waitFor, act } from '@testing-library/react'
import { useNotes } from '../useNotes'

// Server-side notes, changeable from a test to simulate an edit made
// elsewhere (the note-banner userscript on a game page, another device).
let serverNotes: Record<string, string> = {}

function mockFetch() {
  global.fetch = jest.fn(async (_url: string, opts?: RequestInit) => {
    if (opts?.method === 'PUT') {
      const { id, text } = JSON.parse(opts.body as string)
      if (text.trim()) serverNotes = { ...serverNotes, [id]: text.trim() }
      else { const next = { ...serverNotes }; delete next[id]; serverNotes = next }
    }
    return { ok: true, json: async () => ({ notes: serverNotes }) }
  }) as unknown as typeof fetch
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useNotes', () => {
  beforeEach(() => {
    serverNotes = { 'bga:1': 'old plan' }
    mockFetch()
    setVisibility('visible')
  })

  it('loads the notes on mount', async () => {
    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.notes).toEqual({ 'bga:1': 'old plan' }))
  })

  it('picks up a note changed elsewhere when the tab becomes visible again', async () => {
    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.notes['bga:1']).toBe('old plan'))

    setVisibility('hidden')
    serverNotes = { 'bga:1': 'new plan from the game page' }
    act(() => setVisibility('visible'))

    await waitFor(() => expect(result.current.notes['bga:1']).toBe('new plan from the game page'))
  })

  it('picks up a changed note when the window regains focus', async () => {
    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.notes['bga:1']).toBe('old plan'))

    serverNotes = { 'bga:1': 'changed' }
    act(() => { window.dispatchEvent(new Event('focus')) })

    await waitFor(() => expect(result.current.notes['bga:1']).toBe('changed'))
  })

  it('does not refetch while the tab is hidden', async () => {
    renderHook(() => useNotes())
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))

    act(() => setVisibility('hidden'))
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('a refetch that lands during a save does not undo the optimistic note', async () => {
    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.notes['bga:1']).toBe('old plan'))

    // The save is slow; a stale GET (still the old note) answers in between
    let releasePut: () => void = () => {}
    global.fetch = jest.fn(async (_url: string, opts?: RequestInit) => {
      if (opts?.method === 'PUT') {
        await new Promise<void>(r => { releasePut = r })
        serverNotes = { 'bga:1': 'typed here' }
      }
      return { ok: true, json: async () => ({ notes: serverNotes }) }
    }) as unknown as typeof fetch

    let saving: Promise<void> = Promise.resolve()
    act(() => { saving = result.current.saveNote('bga:1', 'typed here') })
    expect(result.current.notes['bga:1']).toBe('typed here')

    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve() })
    expect(result.current.notes['bga:1']).toBe('typed here')

    await act(async () => { releasePut(); await saving })
    expect(result.current.notes['bga:1']).toBe('typed here')
  })
})
