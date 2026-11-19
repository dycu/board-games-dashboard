import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
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
// Most tests use the default 3 games above; the period-filtering tests
// swap this out for their own list rather than mutating the shared one.
let currentGames: FinishedGame[] = games

jest.mock('@/hooks/useFinishedGamesData', () => ({
  useFinishedGamesData: () => ({
    data: { games: currentGames, errors: [], fetchedAt: new Date().toISOString() },
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
let listsForImpl: (platform: string, gameName: string) => string[] = () => []
jest.mock('@/hooks/useBacklog', () => ({
  useBacklog: () => ({ items: [], error: null, listsFor: (p: string, n: string) => listsForImpl(p, n), add: jest.fn(), isAdding: () => false }),
}))
jest.mock('@/hooks/useBgaPlayTotals', () => ({
  useBgaPlayTotals: () => null,
  totalsOf: () => [],
}))
// Not under test here (see hooks/__tests__/useAchievementUnlocks.test.ts) —
// mocked out so it doesn't fire a real, unmocked fetch on every render
jest.mock('@/hooks/useAchievements', () => ({
  useAchievements: () => ({ achievements: [], error: null, create: jest.fn(), remove: jest.fn(), markAchieved: jest.fn(), reload: jest.fn() }),
}))

beforeEach(() => {
  initialPrefs = DEFAULT_PREFS
  listsForImpl = () => []
  currentGames = games
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

describe('OverviewPage Favorite/GM filter', () => {
  it('shows every game when off, regardless of backlog list', () => {
    listsForImpl = () => []
    render(<OverviewPage />)
    expect(shown('Pax')).toBe(true)
    expect(shown('Navegador')).toBe(true)
    expect(shown('Maria')).toBe(true)
  })

  it('keeps a game in either Favorite or GM, dropping the rest, and saves the toggle', async () => {
    listsForImpl = (platform, name) => {
      if (platform === 'bga' && name === 'Pax') return ['favorite']
      if (platform === 'rally' && name === 'Maria') return ['gm']
      return []
    }
    render(<OverviewPage />)
    await userEvent.click(screen.getByRole('button', { name: /Favorite\/GM/ }))

    expect(shown('Pax')).toBe(true)
    expect(shown('Maria')).toBe(true)
    expect(shown('Navegador')).toBe(false)
    expect(mockUpdatePrefs).toHaveBeenCalledWith(expect.objectContaining({ historyBacklogFilter: true }))
    expect(global.fetch).toHaveBeenCalledWith('/api/prefs', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ historyBacklogFilter: true }),
    }))
  })

  it('restores a previously saved toggle instead of always defaulting to off', () => {
    initialPrefs = { ...DEFAULT_PREFS, historyBacklogFilter: true }
    listsForImpl = (platform, name) => (platform === 'yucata' && name === 'Navegador' ? ['favorite'] : [])
    render(<OverviewPage />)
    expect(shown('Pax')).toBe(false)
    expect(shown('Navegador')).toBe(true)
    expect(shown('Maria')).toBe(false)
  })

  it('toggling it back off restores every game and saves', async () => {
    initialPrefs = { ...DEFAULT_PREFS, historyBacklogFilter: true }
    listsForImpl = (platform, name) => (platform === 'yucata' && name === 'Navegador' ? ['favorite'] : [])
    render(<OverviewPage />)
    await userEvent.click(screen.getByRole('button', { name: /Favorite\/GM/ }))

    expect(shown('Pax')).toBe(true)
    expect(shown('Maria')).toBe(true)
    expect(mockUpdatePrefs).toHaveBeenCalledWith(expect.objectContaining({ historyBacklogFilter: false }))
  })
})

describe('OverviewPage finished-games search', () => {
  it('filters the list by name without touching the Summary breakdown above it', async () => {
    render(<OverviewPage />)
    const list = screen.getByText(/Finished games/).closest('section')!
    await userEvent.type(screen.getByLabelText('Filter finished games'), 'pax')

    expect(within(list).queryByText('Pax')).toBeInTheDocument()
    expect(within(list).queryByText('Navegador')).toBeNull()
    expect(within(list).queryByText('Maria')).toBeNull()
    // Still in the Summary card's own breakdown table, unaffected by this search box
    expect(shown('Navegador')).toBe(true)
  })

  it('shows a "no games match" message for a search with no hits, not the generic empty state', async () => {
    render(<OverviewPage />)
    await userEvent.type(screen.getByLabelText('Filter finished games'), 'zzz-no-match')
    expect(screen.getByText(/No games match "zzz-no-match"/)).toBeInTheDocument()
  })
})

describe('OverviewPage period consistency', () => {
  it('narrows the finished-games list to the Summary card\'s own period, not just the Summary itself', async () => {
    const old: FinishedGame = { ...fg('4', 'bga', 'Old Game'), completedAt: new Date(Date.now() - 60 * 86_400_000) }
    currentGames = [...games, old]
    render(<OverviewPage />)

    // Default preset is 7d — a 60-day-old game used to still show in the
    // list below even though the Summary above it already excluded it
    expect(shown('Old Game')).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'All time' }))
    expect(shown('Old Game')).toBe(true)
  })
})
