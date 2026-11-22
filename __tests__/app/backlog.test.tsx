import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BacklogPage from '@/app/backlog/page'
import { GameTagsProvider } from '@/components/GameTagsProvider'
import { Achievement } from '@/lib/achievements/store'
import { FinishedGame } from '@/lib/types'

// Goals needs its own data (achievements, finished games for progress) the
// same way overview.test.tsx mocks these — keeps every test in this file
// off a real, unmocked /api/finished-games stream.
let currentAchievements: Achievement[] = []
let currentFinishedGames: FinishedGame[] = []
const removeAchievement = jest.fn()
jest.mock('@/hooks/useFinishedGamesData', () => ({
  useFinishedGamesData: () => ({ data: { games: currentFinishedGames, errors: [], fetchedAt: new Date().toISOString() }, isLoading: false, lastError: null, platformStatuses: {}, refresh: jest.fn() }),
  readFinishedGamesCache: () => null,
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
  currentFinishedGames = []
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

describe('BacklogPage tag filter', () => {
  // Gaia Project is tagged "live"; Brass: Birmingham is not — both are
  // things actually played (shown under "Add games" > "From your games"),
  // which is exactly where this filter narrows, in place, rather than a
  // separate list of its own.
  function mockFetchWithTags() {
    currentFinishedGames = [
      { id: '1', platform: 'bga', gameName: 'Gaia Project', completedAt: new Date('2026-06-01T00:00:00Z'), completedAgo: '1 day ago', gameUrl: 'https://boardgamearena.com/gaia' },
      { id: '2', platform: 'bga', gameName: 'Brass: Birmingham', completedAt: new Date('2026-06-02T00:00:00Z'), completedAgo: '1 day ago', gameUrl: 'https://boardgamearena.com/brass' },
    ]
    global.fetch = jest.fn(async (url: string) => {
      if (url === '/api/prefs') return { ok: true, json: async () => ({}) }
      if (url === '/api/backlog') return { ok: true, json: async () => ({ items: [] }) }
      if (url === '/api/game-tags') {
        return { ok: true, json: async () => ({ byPlatform: { bga: { 'gaia project': { tags: ['live'], gameName: 'Gaia Project' } } } }) }
      }
      return { ok: true, json: async () => ({}) }
    }) as unknown as typeof fetch
  }

  async function openPlayedTab() {
    // "played" is already the default source tab, but asserting it explicitly
    // keeps this robust if that default ever changes
    await userEvent.click(screen.getAllByRole('button', { name: 'From your games' })[0])
  }

  it('shows a filter chip for a tag in use', async () => {
    mockFetchWithTags()
    render(<GameTagsProvider><BacklogPage /></GameTagsProvider>)
    expect(await screen.findByRole('button', { name: 'live' })).toBeInTheDocument()
  })

  it('shows the tag filter under "Add games", not among the list tabs above', async () => {
    mockFetchWithTags()
    render(<GameTagsProvider><BacklogPage /></GameTagsProvider>)
    const tagButton = await screen.findByRole('button', { name: 'live' })
    expect(tagButton.closest('[class*="rounded-xl"]')?.textContent).toMatch(/Add games/)
  })

  // The same game picker inside Goals (always mounted, just CSS-hidden
  // behind the other source tabs) can list the same titles — scoped to
  // PlayedPanel's own list so these don't get tripped up by that.
  async function playedList() {
    await openPlayedTab()
    return within(await screen.findByTestId('played-games'))
  }

  it('narrows "From your games" to the selected tag in place, instead of a separate list', async () => {
    mockFetchWithTags()
    render(<GameTagsProvider><BacklogPage /></GameTagsProvider>)
    const list = await playedList()
    expect(await list.findByText('Gaia Project')).toBeInTheDocument()
    expect(await list.findByText('Brass: Birmingham')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'live' }))
    expect(await list.findByText('Gaia Project')).toBeInTheDocument()
    expect(list.queryByText('Brass: Birmingham')).toBeNull()
  })

  it('shows the tag on the played row itself', async () => {
    mockFetchWithTags()
    render(<GameTagsProvider><BacklogPage /></GameTagsProvider>)
    const list = await playedList()
    const row = (await list.findByText('Gaia Project')).closest('li')!
    expect(within(row).getByText(/live/)).toBeInTheDocument()
  })

  it('clears back to the full list once the tag is deselected', async () => {
    mockFetchWithTags()
    render(<GameTagsProvider><BacklogPage /></GameTagsProvider>)
    const list = await playedList()
    await userEvent.click(await screen.findByRole('button', { name: 'live' }))
    expect(list.queryByText('Brass: Birmingham')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'live' }))
    expect(await list.findByText('Brass: Birmingham')).toBeInTheDocument()
  })
})
