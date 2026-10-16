import { renderHook, waitFor, act } from '@testing-library/react'
import { usePrefs } from '../usePrefs'
import { DEFAULT_PREFS, UserPrefs } from '@/lib/types'

const PREFS_KEY = 'user-prefs'

describe('usePrefs', () => {
  beforeEach(() => {
    localStorage.clear()
    global.fetch = jest.fn(async () => ({ json: async () => DEFAULT_PREFS })) as unknown as typeof fetch
  })

  it('starts from DEFAULT_PREFS before anything loads', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch // never resolves
    const { result } = renderHook(() => usePrefs())
    expect(result.current.prefs).toEqual(DEFAULT_PREFS)
  })

  it('adopts the cached localStorage value synchronously, before the server answers', async () => {
    const cached: UserPrefs = { ...DEFAULT_PREFS, pins: ['bga:1'] }
    localStorage.setItem(PREFS_KEY, JSON.stringify(cached))
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch // never resolves

    const { result } = renderHook(() => usePrefs())
    await waitFor(() => expect(result.current.prefs).toEqual(cached))
  })

  it('replaces the cached value with the server copy once it answers, and re-caches it', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, pins: ['stale'] }))
    const fresh: UserPrefs = { ...DEFAULT_PREFS, pins: ['bga:fresh'] }
    global.fetch = jest.fn(async () => ({ json: async () => fresh })) as unknown as typeof fetch

    const { result } = renderHook(() => usePrefs())
    await waitFor(() => expect(result.current.prefs).toEqual(fresh))
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toEqual(fresh)
  })

  it('updatePrefs writes through to local state and localStorage immediately', async () => {
    const { result } = renderHook(() => usePrefs())
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    const updated: UserPrefs = { ...DEFAULT_PREFS, sunk: ['bga:1'] }
    act(() => { result.current.updatePrefs(updated) })

    expect(result.current.prefs).toEqual(updated)
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toEqual(updated)
  })
})
