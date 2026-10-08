import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GameGrid from '@/components/GameGrid'
import { GamesApiResponse, DEFAULT_PREFS, PLATFORM_URLS, Game, UserPrefs } from '@/lib/types'

beforeEach(() => {
  // notes and backlog load on mount
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ notes: {}, items: [] }) })) as unknown as typeof fetch
})

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
    platformUrl: PLATFORM_URLS[platform],
    players: [],
  }
}

const defaultGridProps = {
  prefs: DEFAULT_PREFS,
  onPrefsChange: () => {},
  dismissed: new Set<string>(),
  onRefresh: () => {},
  isRefreshing: false,
  lastError: null,
  cachedAt: null,
  onOpen: () => {},
  departedGames: [],
}

function renderGrid(games: Game[] = [], errors: GamesApiResponse['errors'] = []) {
  const data: GamesApiResponse = { games, errors, fetchedAt: new Date().toISOString() }
  render(<GameGrid {...defaultGridProps} data={data} />)
}

describe('GameGrid header navigation', () => {
  it('renders History navigation link', () => {
    renderGrid([makeGame('bga', '1')])
    const historyLink = screen.getByRole('link', { name: /history/i })
    expect(historyLink).toHaveAttribute('href', '/overview')
  })
})

describe('GameGrid platform filter', () => {
  it('shows a filter chip per platform, including ones that errored, once each', () => {
    const data: GamesApiResponse = {
      games: [makeGame('bga', '1'), makeGame('bga', '2'), makeGame('yucata', '3')],
      errors: [{ platform: 'bga', error: 'partial' }, { platform: 'rally', error: 'timeout' }],
      fetchedAt: new Date().toISOString(),
    }
    render(<GameGrid {...defaultGridProps} data={data} />)
    expect(screen.getAllByRole('button', { name: /^BGA \(2\)/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: /^Yucata \(1\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Rally the Troops \(0\)/ })).toBeInTheDocument()
  })

  it('filters to a platform when its chip is clicked', async () => {
    const onPrefsChange = jest.fn()
    const data: GamesApiResponse = { games: [makeGame('bga', '1'), makeGame('yucata', '2')], errors: [], fetchedAt: new Date().toISOString() }
    render(<GameGrid {...defaultGridProps} onPrefsChange={onPrefsChange} data={data} />)
    await userEvent.click(screen.getByRole('button', { name: /^Yucata/ }))
    expect(onPrefsChange).toHaveBeenCalledWith(expect.objectContaining({ filter: expect.objectContaining({ platforms: ['yucata'] }) }))
  })
})

describe('GameGrid sections', () => {
  const waiting = (id: string, daysAgo: number, name = `Waiting ${id}`): Game => ({
    ...makeGame('bga', id),
    gameName: name,
    myTurn: false,
    lastMoveAt: new Date(Date.now() - daysAgo * 86_400_000),
  })

  it('offers the first your-turn game as "Next"', () => {
    const urgent = { ...makeGame('bga', '9'), gameName: 'Urgent One', deadlineAt: new Date(Date.now() + 3600_000).toISOString() }
    renderGrid([makeGame('bga', '1'), urgent])
    // a link, so middle-click opens it in a new tab
    expect(screen.getByRole('link', { name: /Next: Urgent One/ })).toHaveAttribute('href', 'https://example.com/game/9')
  })

  it('says all caught up when nothing is waiting for me', () => {
    renderGrid([waiting('1', 1)])
    expect(screen.getByText(/All caught up/)).toBeInTheDocument()
  })

  it('shows only slow-opponent waiting games until expanded', async () => {
    renderGrid([waiting('1', 1, 'Recent'), waiting('2', 9, 'Stalled')])
    expect(screen.getByText('Stalled')).toBeInTheDocument()
    expect(screen.queryByText('Recent')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Show 1 more/ }))
    expect(screen.getByText('Recent')).toBeInTheDocument()
  })

  it('hides the your-turn section when filtered to waiting', () => {
    const prefs: UserPrefs = { ...DEFAULT_PREFS, filter: { turnStatus: 'waiting', platforms: [] } }
    render(<GameGrid {...defaultGridProps} prefs={prefs} data={{ games: [makeGame('bga', '1')], errors: [], fetchedAt: '' }} />)
    expect(screen.queryByText(/Your turn ·/)).toBeNull()
  })
})

describe('GameGrid departed games banner', () => {
  it('opens a departed BGA game in the same tab to trigger desktop mode', () => {
    const data: GamesApiResponse = { games: [], errors: [], fetchedAt: new Date().toISOString() }
    render(
      <GameGrid
        {...defaultGridProps}
        data={data}
        departedGames={[
          { id: 'bga:1', gameName: 'Test Game', platform: 'bga', gameUrl: 'https://boardgamearena.com/en/thegame?table=1' },
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: 'Test Game' })
    expect(link).toHaveAttribute('target', '_self')
  })

  it('opens a departed non-BGA game in a new tab', () => {
    const data: GamesApiResponse = { games: [], errors: [], fetchedAt: new Date().toISOString() }
    render(
      <GameGrid
        {...defaultGridProps}
        data={data}
        departedGames={[
          { id: 'yucata:1', gameName: 'Other Game', platform: 'yucata', gameUrl: 'https://yucata.de/game/1' },
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: 'Other Game' })
    expect(link).toHaveAttribute('target', '_blank')
  })
})

describe('GameGrid backlog suggestion', () => {
  it('suggests the top "Next to play" game not already running', async () => {
    const items = [
      { id: 'bga:testgame', platform: 'bga', gameName: 'Test Game', playUrl: 'https://x/1', addedAt: '', list: 'play' },
      { id: 'bga:learnme', platform: 'bga', gameName: 'Learn Me', playUrl: 'https://x/2', addedAt: '', list: 'learn' },
      { id: 'yucata:navegador', platform: 'yucata', gameName: 'Navegador', playUrl: 'https://x/3', addedAt: '', list: 'play' },
    ]
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ notes: {}, items }) })) as unknown as typeof fetch
    renderGrid([makeGame('bga', '1')])
    expect(await screen.findByText('Navegador')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Play/ })).toHaveAttribute('href', 'https://x/3')
  })
})

describe('GameGrid opened games', () => {
  it('keeps an opened game, dimmed, after the others; Next and the count skip it', () => {
    const a = { ...makeGame('bga', '1'), gameName: 'Opened One' }
    const b = { ...makeGame('bga', '2'), gameName: 'Still To Play' }
    render(<GameGrid {...defaultGridProps} dismissed={new Set(['bga:1'])} data={{ games: [a, b], errors: [], fetchedAt: '' }} />)
    expect(screen.getByText('Opened One')).toBeInTheDocument()
    expect(screen.getByText('opened')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Next: Still To Play/ })).toBeInTheDocument()
    expect(screen.getByText(/Your turn · 1/)).toBeInTheDocument()
    expect(document.title).toBe('(1) Board Games Dashboard')
  })
})

describe('GameGrid recently opened games', () => {
  it('keeps a game I opened in the collapsed Waiting list after my move', async () => {
    localStorage.clear()
    const mine = { ...makeGame('bga', '1'), gameName: 'Just Played' }
    const other = { ...makeGame('bga', '2'), gameName: 'Other Recent', myTurn: false }
    const { rerender } = render(<GameGrid {...defaultGridProps} data={{ games: [mine, other], errors: [], fetchedAt: '1' }} />)
    const link = screen.getByRole('link', { name: 'Open Just Played' })
    link.addEventListener('click', e => e.preventDefault())
    await userEvent.click(link)
    // the refresh after my move: it's the opponent's turn now
    rerender(<GameGrid {...defaultGridProps} data={{ games: [{ ...mine, myTurn: false }, other], errors: [], fetchedAt: '2' }} />)
    expect(screen.getByText('Just Played')).toBeInTheDocument()
    expect(screen.queryByText('Other Recent')).toBeNull()
  })
})

describe('GameGrid backlog suggestion with many games', () => {
  it('still shows the suggestion when many games are active', async () => {
    const items = [{ id: 'yucata:navegador', platform: 'yucata', gameName: 'Navegador', playUrl: 'https://x/3', addedAt: '', list: 'play' }]
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ notes: {}, items }) })) as unknown as typeof fetch
    renderGrid(Array.from({ length: 12 }, (_, i) => makeGame('bga', String(i))))
    expect(await screen.findByText('Navegador')).toBeInTheDocument()
  })
})

describe('GameGrid opened game after the move', () => {
  it('keeps an opened game with my games even once it is the opponent\'s turn', () => {
    const played = { ...makeGame('bga', '1'), gameName: 'Played', myTurn: false }
    render(<GameGrid {...defaultGridProps} dismissed={new Set(['bga:1'])} data={{ games: [played], errors: [], fetchedAt: '' }} />)
    expect(screen.getByText('opened')).toBeInTheDocument()
    expect(screen.queryByText(/Waiting for others/)).toBeNull()
  })
})

describe('GameGrid Next link', () => {
  it('keeps pointing at the shown game while the click is handled', async () => {
    const first = { ...makeGame('bga', '1'), gameName: 'First', lastMoveAt: new Date(Date.now() - 9 * 3600_000) }
    const second = { ...makeGame('bga', '2'), gameName: 'Second' }
    let hrefAtClick = ''
    function Wrapper() {
      const [dismissed, setDismissed] = React.useState(new Set<string>())
      return <GameGrid {...defaultGridProps} dismissed={dismissed} onOpen={id => setDismissed(new Set([id]))} data={{ games: [first, second], errors: [], fetchedAt: '' }} />
    }
    render(<Wrapper />)
    const link = screen.getByRole('link', { name: /Next: First/ })
    // In a real browser React re-renders (in a microtask) before the link is
    // followed; jsdom's synthetic click can't reproduce that timing, so this only
    // guards that the href is still the shown game's when the click is handled
    const onDocClick = (e: MouseEvent) => { hrefAtClick = (e.target as HTMLElement).closest('a')!.href; e.preventDefault() }
    document.addEventListener('click', onDocClick)
    await userEvent.click(link)
    document.removeEventListener('click', onDocClick)
    expect(hrefAtClick).toBe('https://example.com/game/1')
    expect(await screen.findByRole('link', { name: /Next: Second/ })).toBeInTheDocument()
  })
})
