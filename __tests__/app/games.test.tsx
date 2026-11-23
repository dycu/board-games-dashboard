import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GamesPage from '@/app/games/page'
import { GameTagsProvider } from '@/components/GameTagsProvider'
import { FinishedGame } from '@/lib/types'

let currentFinishedGames: FinishedGame[] = []
jest.mock('@/hooks/useFinishedGamesData', () => ({
  useFinishedGamesData: () => ({ data: { games: currentFinishedGames, errors: [], fetchedAt: new Date().toISOString() }, isLoading: false, lastError: null, platformStatuses: {}, refresh: jest.fn() }),
  readFinishedGamesCache: () => null,
}))

const fg = (id: string, platform: FinishedGame['platform'], gameName: string): FinishedGame => ({
  id, platform, gameName, completedAt: new Date('2026-06-01T00:00:00Z'), completedAgo: '1 day ago', gameUrl: `https://example.com/${id}`,
})

function mockFetch(opts: { backlogItems?: unknown[]; tagsByPlatform?: unknown } = {}) {
  const { backlogItems = [], tagsByPlatform = {} } = opts
  global.fetch = jest.fn(async (url: string) => {
    if (url === '/api/backlog') return { ok: true, json: async () => ({ items: backlogItems }) }
    if (url === '/api/backlog/bga-plays') return { ok: true, json: async () => ({ totals: [] }) }
    if (url === '/api/game-tags') return { ok: true, json: async () => ({ byPlatform: tagsByPlatform }) }
    return { ok: true, json: async () => ({}) }
  }) as unknown as typeof fetch
}

beforeEach(() => { currentFinishedGames = [] })

function renderPage() {
  render(<GameTagsProvider><GamesPage /></GameTagsProvider>)
}

describe('GamesPage', () => {
  it('lists every played title', async () => {
    currentFinishedGames = [fg('1', 'bga', 'Gaia Project'), fg('2', 'yucata', 'Navegador')]
    mockFetch()
    renderPage()
    expect(await screen.findByText('Gaia Project')).toBeInTheDocument()
    expect(await screen.findByText('Navegador')).toBeInTheDocument()
  })

  it('includes a backlog-only title that has never actually been played', async () => {
    mockFetch({ backlogItems: [{ id: 'bga:learntome', platform: 'bga', gameName: 'Learn To Me', playUrl: 'https://x', addedAt: '', list: 'learn' }] })
    renderPage()
    expect(await screen.findByText('Learn To Me')).toBeInTheDocument()
  })

  it('filters by a search term', async () => {
    currentFinishedGames = [fg('1', 'bga', 'Gaia Project'), fg('2', 'yucata', 'Navegador')]
    mockFetch()
    renderPage()
    await screen.findByText('Gaia Project')
    await userEvent.type(screen.getByPlaceholderText(/Filter \d+ games/), 'gaia')
    expect(screen.getByText('Gaia Project')).toBeInTheDocument()
    expect(screen.queryByText('Navegador')).toBeNull()
  })

  it('filters to untagged titles only', async () => {
    currentFinishedGames = [fg('1', 'bga', 'Gaia Project'), fg('2', 'yucata', 'Navegador')]
    mockFetch({ tagsByPlatform: { bga: { 'gaia project': { tags: ['heavy'], gameName: 'Gaia Project' } } } })
    renderPage()
    await screen.findByText('Gaia Project')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Untagged only' }))
    expect(screen.queryByText('Gaia Project')).toBeNull()
    expect(screen.getByText('Navegador')).toBeInTheDocument()
  })

  it('sorts by play count', async () => {
    currentFinishedGames = [
      fg('1', 'bga', 'Navegador'),
      fg('2', 'bga', 'Gaia Project'),
      fg('3', 'bga', 'Gaia Project'),
    ]
    mockFetch()
    renderPage()
    await screen.findByText('Gaia Project')

    await userEvent.click(screen.getByRole('button', { name: 'Most played' }))
    let items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Gaia Project')
    expect(items[1]).toHaveTextContent('Navegador')

    await userEvent.click(screen.getByRole('button', { name: 'Least played' }))
    items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Navegador')
    expect(items[1]).toHaveTextContent('Gaia Project')
  })

  it('edits a title\'s tags in place', async () => {
    currentFinishedGames = [fg('1', 'bga', 'Gaia Project')]
    mockFetch()
    renderPage()
    await screen.findByText('Gaia Project')
    await userEvent.type(screen.getByLabelText('Add a new tag'), 'heavy{Enter}')
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/game-tags', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ platform: 'bga', gameName: 'Gaia Project', tags: ['heavy'] }),
    })))
  })
})
