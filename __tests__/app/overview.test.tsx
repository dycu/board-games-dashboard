import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OverviewPage from '@/app/overview/page'
import { DEFAULT_PREFS, FinishedGame, UserPrefs } from '@/lib/types'

const fg = (id: string, platform: FinishedGame['platform'], gameName: string): FinishedGame => ({
  id, platform, gameName, completedAt: new Date(), completedAgo: '1h ago', gameUrl: `https://example.com/${id}`,
})

const games = [fg('1', 'bga', 'Pax'), fg('2', 'yucata', 'Navegador'), fg('3', 'rally', 'Maria')]

// A real useState so clicking a chip actually re-renders the page, the same
// way the real usePrefs's own state update does; seeded per-test from
// initialPrefs, read fresh on each render() since that's a new component tree.
let initialPrefs: UserPrefs = DEFAULT_PREFS
const mockUpdatePrefs = jest.fn()

jest.mock('@/hooks/useFinishedGamesData', () => ({
  useFinishedGamesData: () => ({
    data: { games, errors: [], fetchedAt: new Date().toISOString() },
    isLoading: false,
    lastError: null,
    platformStatuses: {},
    refresh: jest.fn(),
  }),
}))
jest.mock('@/hooks/usePrefs', () => ({
  usePrefs: () => {
    const [prefs, setPrefs] = useState(() => initialPrefs)
    return { prefs, updatePrefs: (p: UserPrefs) => { mockUpdatePrefs(p); setPrefs(p) } }
  },
}))
jest.mock('@/hooks/useBacklog', () => ({
  useBacklog: () => ({ items: [], error: null, listsFor: () => [], add: jest.fn(), isAdding: () => false }),
}))
jest.mock('@/hooks/useBgaPlayTotals', () => ({
  useBgaPlayTotals: () => null,
  totalsOf: () => [],
}))

beforeEach(() => {
  initialPrefs = DEFAULT_PREFS
  mockUpdatePrefs.mockClear()
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ recent: null }) })) as unknown as typeof fetch
})

// "Pax" etc. each show up twice (the finished-game card list and the
// Summary card's per-game breakdown table), and "All" is ambiguous with
// PeriodSummary's own "All time" preset — so these check counts/game-shaped
// text rather than a single unique element.
const shown = (name: string) => screen.queryAllByText(name).length > 0

describe('OverviewPage platform filter', () => {
  it('shows every platform by default', () => {
    render(<OverviewPage />)
    expect(shown('Pax')).toBe(true)
    expect(shown('Navegador')).toBe(true)
    expect(shown('Maria')).toBe(true)
  })

  it('builds an arbitrary subset by toggling platforms on one at a time, and saves it', async () => {
    initialPrefs = { ...DEFAULT_PREFS, historyPlatformFilter: ['bga'] }
    render(<OverviewPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Yucata (1)' }))

    expect(shown('Pax')).toBe(true)
    expect(shown('Navegador')).toBe(true)
    expect(shown('Maria')).toBe(false)
    expect(mockUpdatePrefs).toHaveBeenCalledWith(expect.objectContaining({ historyPlatformFilter: ['bga', 'yucata'] }))
    expect(global.fetch).toHaveBeenCalledWith('/api/prefs', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ historyPlatformFilter: ['bga', 'yucata'] }),
    }))
  })

  it('dropping one platform out of "All" leaves the rest shown, not just that one', async () => {
    render(<OverviewPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Rally (1)' }))

    expect(shown('Pax')).toBe(true)
    expect(shown('Navegador')).toBe(true)
    expect(shown('Maria')).toBe(false)
    expect(mockUpdatePrefs).toHaveBeenCalledWith(expect.objectContaining({ historyPlatformFilter: ['bga', 'yucata'] }))
  })

  it('restores a previously saved filter instead of always defaulting to all platforms', () => {
    initialPrefs = { ...DEFAULT_PREFS, historyPlatformFilter: ['yucata'] }
    render(<OverviewPage />)
    expect(shown('Pax')).toBe(false)
    expect(shown('Navegador')).toBe(true)
    expect(shown('Maria')).toBe(false)
  })

  it('"All" resets back to every platform and saves the empty/all state', async () => {
    initialPrefs = { ...DEFAULT_PREFS, historyPlatformFilter: ['yucata'] }
    render(<OverviewPage />)
    await userEvent.click(screen.getByRole('button', { name: 'All (3)' }))

    expect(shown('Pax')).toBe(true)
    expect(shown('Navegador')).toBe(true)
    expect(shown('Maria')).toBe(true)
    expect(mockUpdatePrefs).toHaveBeenCalledWith(expect.objectContaining({ historyPlatformFilter: [] }))
  })

  it('clicking "All" while already showing every platform hides everything', async () => {
    render(<OverviewPage />)
    await userEvent.click(screen.getByRole('button', { name: 'All (3)' }))

    expect(shown('Pax')).toBe(false)
    expect(shown('Navegador')).toBe(false)
    expect(shown('Maria')).toBe(false)
    expect(mockUpdatePrefs).toHaveBeenCalledWith(expect.objectContaining({ historyPlatformFilter: null }))
  })
})
