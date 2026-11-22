import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BacklogPage from '@/app/backlog/page'
import { GameTagsProvider } from '@/components/GameTagsProvider'
import { Achievement } from '@/lib/achievements/store'

// Goals needs its own data (achievements, finished games for progress) the
// same way overview.test.tsx mocks these — keeps every test in this file
// off a real, unmocked /api/finished-games stream.
let currentAchievements: Achievement[] = []
const removeAchievement = jest.fn()
jest.mock('@/hooks/useFinishedGamesData', () => ({
  useFinishedGamesData: () => ({ data: { games: [], errors: [], fetchedAt: new Date().toISOString() }, isLoading: false, lastError: null, platformStatuses: {}, refresh: jest.fn() }),
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
  // Gaia Project is both backlog-listed and tagged "live"; Nevsky is tagged
  // "live" too but has no backlog entry at all — exactly the case that
  // prompted this view (a freshly-tagged title with no list, active game
  // or finished game to otherwise show up under).
  function mockFetchWithTags() {
    global.fetch = jest.fn(async (url: string) => {
      if (url === '/api/prefs') return { ok: true, json: async () => ({}) }
      if (url === '/api/backlog') {
        return {
          ok: true,
          json: async () => ({
            items: [{ id: 'bga:gaiaproject', platform: 'bga', gameName: 'Gaia Project', playUrl: 'https://boardgamearena.com/gaia', addedAt: '', list: 'play' }],
          }),
        }
      }
      if (url === '/api/game-tags') {
        return {
          ok: true,
          json: async () => ({
            byPlatform: {
              bga: { 'gaia project': { tags: ['live'], gameName: 'Gaia Project' } },
              rally: { nevsky: { tags: ['live'], gameName: 'Nevsky' } },
            },
          }),
        }
      }
      if (url.startsWith('/api/game-search')) {
        return {
          ok: true,
          json: async () => ({ results: [{ platform: 'rally', matches: [{ name: 'Nevsky', url: 'https://rally.example/nevsky' }] }], errors: [] }),
        }
      }
      return { ok: true, json: async () => ({}) }
    }) as unknown as typeof fetch
  }

  it('shows a filter chip for a tag in use', async () => {
    mockFetchWithTags()
    render(<GameTagsProvider><BacklogPage /></GameTagsProvider>)
    expect(await screen.findByRole('button', { name: 'live' })).toBeInTheDocument()
  })

  it('lists every title with the tag when selected, including one with no backlog entry', async () => {
    mockFetchWithTags()
    render(<GameTagsProvider><BacklogPage /></GameTagsProvider>)
    await userEvent.click(await screen.findByRole('button', { name: 'live' }))
    // Gaia Project is also still in the Play list above — unaffected by the
    // tag filter, which is its own separate section — so it now appears
    // twice; Nevsky (no backlog entry) only ever shows up here.
    expect((await screen.findAllByText('Gaia Project')).length).toBeGreaterThanOrEqual(2)
    expect(await screen.findByText('Nevsky')).toBeInTheDocument()
  })

  it('resolves a Play link for an untracked tagged title via the game catalog', async () => {
    mockFetchWithTags()
    render(<GameTagsProvider><BacklogPage /></GameTagsProvider>)
    await userEvent.click(await screen.findByRole('button', { name: 'live' }))
    const row = (await screen.findByText('Nevsky')).closest('li')!
    await waitFor(() => expect(within(row).getByRole('link', { name: 'Play Nevsky' })).toHaveAttribute('href', 'https://rally.example/nevsky'))
  })

  it('shows its own "Browse by tag" section, separate from the list tabs above', async () => {
    mockFetchWithTags()
    render(<GameTagsProvider><BacklogPage /></GameTagsProvider>)
    expect(await screen.findByText('Browse by tag')).toBeInTheDocument()
  })

  // The real production bug this was all caught by: a tag saved before
  // GameTagEntry gained its own gameName field has none — titlesWithTag
  // falls back to the hash key for it (see lib/gameTags/match.ts), but
  // this is the end-to-end proof the page itself survives selecting it.
  it('does not crash when a stored tag has no gameName (saved before that field existed)', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url === '/api/prefs') return { ok: true, json: async () => ({}) }
      if (url === '/api/backlog') return { ok: true, json: async () => ({ items: [] }) }
      if (url === '/api/game-tags') {
        return { ok: true, json: async () => ({ byPlatform: { bga: { 'gaia project': { tags: ['live'] } } } }) }
      }
      if (url.startsWith('/api/game-search')) return { ok: true, json: async () => ({ results: [], errors: [] }) }
      return { ok: true, json: async () => ({}) }
    }) as unknown as typeof fetch
    render(<GameTagsProvider><BacklogPage /></GameTagsProvider>)
    await userEvent.click(await screen.findByRole('button', { name: 'live' }))
    expect(await screen.findByText('gaia project')).toBeInTheDocument()
  })

  it('hides the "browse by tag" section again once the tag is deselected, leaving the list above untouched', async () => {
    mockFetchWithTags()
    render(<GameTagsProvider><BacklogPage /></GameTagsProvider>)
    expect(await screen.findByText('Gaia Project')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'live' }))
    expect(await screen.findByText('Nevsky')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'live' }))
    expect(screen.queryByText('Nevsky')).toBeNull()
    expect(screen.getByText('Gaia Project')).toBeInTheDocument()
  })
})
