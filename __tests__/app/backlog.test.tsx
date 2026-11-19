import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BacklogPage from '@/app/backlog/page'
import { Achievement } from '@/lib/achievements/store'

// Goals needs its own data (achievements, finished games for progress) the
// same way overview.test.tsx mocks these — keeps every test in this file
// off a real, unmocked /api/finished-games stream.
let currentAchievements: Achievement[] = []
const removeAchievement = jest.fn()
jest.mock('@/hooks/useFinishedGamesData', () => ({
  useFinishedGamesData: () => ({ data: { games: [], errors: [], fetchedAt: new Date().toISOString() }, isLoading: false, lastError: null, platformStatuses: {}, refresh: jest.fn() }),
}))
jest.mock('@/hooks/useBgaPlayTotals', () => ({
  useBgaPlayTotals: () => null,
  totalsOf: () => [],
}))
jest.mock('@/hooks/useAchievements', () => ({
  useAchievements: () => ({ achievements: currentAchievements, error: null, create: jest.fn(), remove: removeAchievement, markAchieved: jest.fn(), reload: jest.fn() }),
}))

function mockFetch() {
  global.fetch = jest.fn(async (url: string) => {
    if (url === '/api/prefs') return { ok: true, json: async () => ({}) }
    if (url === '/api/backlog') return { ok: true, json: async () => ({ items: [] }) }
    if (url.startsWith('/api/game-search')) {
      return {
        ok: true,
        json: async () => ({
          results: [
            { platform: 'bga', matches: [{ name: 'Wingspan', url: 'https://boardgamearena.com/wingspan' }] },
            { platform: 'tabletapas', matches: [{ name: 'Indonesia', url: 'https://play.tabletapasgames.com/library' }] },
          ],
          errors: [],
        }),
      }
    }
    return { ok: true, json: async () => ({}) }
  }) as unknown as typeof fetch
}

beforeEach(() => {
  currentAchievements = []
  removeAchievement.mockClear()
})

const goal = (id: string, gameType: string, target: number, achievedAt?: string): Achievement =>
  ({ id, platform: null, gameType, metric: 'played', target, createdAt: new Date().toISOString(), ...(achievedAt && { achievedAt }) })

// "Goals" names both the new top-of-page tab and the pre-existing "Add
// games" card's own Goals tab (its game-picker) — same ambiguity as
// "Search" above, resolved the same way: wait for both to exist, then take
// the one that comes first in document order (the top-of-page tab).
async function findTopGoalsTab() {
  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Goals/ })).toHaveLength(2))
  return screen.getAllByRole('button', { name: /^Goals/ })[0]
}

describe('BacklogPage Goals tab', () => {
  beforeEach(() => mockFetch())

  it('shows the count of in-progress goals on the tab pill, not counting unlocked ones', async () => {
    currentAchievements = [goal('a', 'Wingspan', 10), goal('b', 'Pax', 5, '2026-01-01T00:00:00.000Z')]
    render(<BacklogPage />)
    expect(await findTopGoalsTab()).toHaveTextContent('1')
  })

  it('shows in-progress and unlocked goals when the tab is selected, instead of a backlog list', async () => {
    currentAchievements = [goal('a', 'Wingspan', 10), goal('b', 'Pax', 5, '2026-01-01T00:00:00.000Z')]
    render(<BacklogPage />)
    await userEvent.click(await findTopGoalsTab())

    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByText(/Play 10 Wingspan/)).toBeInTheDocument()
    expect(screen.getByText('Unlocked')).toBeInTheDocument()
    expect(screen.getByText(/Play 5 Pax/)).toBeInTheDocument()
  })

  it('deletes a goal from the summary without needing the game-picker panel below', async () => {
    currentAchievements = [goal('a', 'Wingspan', 10)]
    render(<BacklogPage />)
    await userEvent.click(await findTopGoalsTab())

    await userEvent.click(screen.getByRole('button', { name: 'Delete goal' }))
    expect(removeAchievement).toHaveBeenCalledWith('a')
  })

  it('shows an empty state instead of a blank section when no goals are set', async () => {
    render(<BacklogPage />)
    await userEvent.click(await findTopGoalsTab())
    expect(screen.getByText(/No goals set yet/)).toBeInTheDocument()
  })
})

describe('BacklogPage search — TableTapas', () => {
  beforeEach(() => mockFetch())

  async function searchFor(text: string) {
    // Both panels are always mounted (the inactive one just CSS-hidden), so
    // "Search" names both the source-tab pill and the panel's own submit
    // button — the tab pill comes first in document order.
    await userEvent.click(screen.getAllByRole('button', { name: 'Search' })[0])
    await userEvent.type(screen.getByPlaceholderText('Game name…'), `${text}{Enter}`)
  }

  it('is hidden from results until its own chip is turned on', async () => {
    render(<BacklogPage />)
    await searchFor('a')
    expect(await screen.findByText('Wingspan')).toBeInTheDocument()
    expect(screen.queryByText('Indonesia')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'TblTapas' }))
    expect(await screen.findByText('Indonesia')).toBeInTheDocument()
  })

  it('shows only a play link for a TableTapas match, no backlog chips or history link', async () => {
    render(<BacklogPage />)
    await userEvent.click(screen.getByRole('button', { name: 'TblTapas' }))
    await searchFor('a')

    const row = (await screen.findByText('Indonesia')).closest('li')!
    expect(row).toHaveTextContent('Play ↗')
    expect(row.querySelector('a[href="https://play.tabletapasgames.com/library"]')).not.toBeNull()
    expect(row.querySelector('[aria-label*="Favorite"]')).toBeNull()

    // The real-platform row right next to it still gets the full treatment
    const bgaRow = screen.getByText('Wingspan').closest('li')!
    expect(bgaRow.querySelector('[aria-label*="Favorite"]')).not.toBeNull()
  })
})
