import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import InviteAgainButton from '@/components/InviteAgainButton'

let mockByPlatform: Record<string, Record<string, { tags: string[]; responseSamples: number[]; hidden?: boolean }>> | null = null

jest.mock('@/components/OpponentsProvider', () => ({
  useOpponentsContext: () => ({ byPlatform: mockByPlatform }),
}))

function setFinishedGamesCache(games: {
  platform: string
  gameName: string
  gameType?: string
  opponents: { name: string; rank?: number }[]
  completedAt?: string
  startedAt?: string
  result?: string
  rank?: number
}[]) {
  localStorage.setItem('finished-games-cache', JSON.stringify({
    games: games.map((g, i) => ({
      id: `g${i}`,
      completedAt: '2026-01-01T00:00:00.000Z',
      completedAgo: '1 day ago',
      gameUrl: 'https://x',
      ...g,
    })),
    errors: [],
    fetchedAt: '2026-01-01T00:00:00.000Z',
  }))
}

const writeText = jest.fn().mockResolvedValue(undefined)
const windowOpen = jest.fn()
const URL_ = 'https://example.com/play/42'

beforeEach(() => {
  mockByPlatform = null
  localStorage.clear()
  writeText.mockClear()
  windowOpen.mockClear()
  Object.assign(navigator, { clipboard: { writeText } })
  window.open = windowOpen
})

describe('InviteAgainButton', () => {
  it('renders nothing (not even the button) when there is no history for this game on this platform', () => {
    const { container } = render(<InviteAgainButton platform="bga" gameName="Indonesia" url={URL_} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('only lists opponents from games of this exact title, not every opponent on the platform', () => {
    setFinishedGamesCache([
      { platform: 'bga', gameName: 'Indonesia', opponents: [{ name: 'alice' }] },
      { platform: 'bga', gameName: 'Food Chain Magnate', opponents: [{ name: 'bob' }] },
    ])
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [] }, bob: { tags: [], responseSamples: [] } } }
    render(<InviteAgainButton platform="bga" gameName="Indonesia" url={URL_} />)
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.queryByText('bob')).toBeNull()
  })

  it('matches by gameType when the table has a custom title', () => {
    setFinishedGamesCache([
      { platform: 'bga', gameName: "Alice's table", gameType: 'Indonesia', opponents: [{ name: 'alice' }] },
    ])
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [] } } }
    render(<InviteAgainButton platform="bga" gameName="Indonesia" url={URL_} />)
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('shows games-together count, record, last played date, and tags for this title', () => {
    setFinishedGamesCache([
      { platform: 'bga', gameName: 'Indonesia', opponents: [{ name: 'alice', rank: 2 }], rank: 1, result: 'won', completedAt: '2026-01-01T00:00:00.000Z' },
      { platform: 'bga', gameName: 'Indonesia', opponents: [{ name: 'alice', rank: 1 }], rank: 2, result: 'lost', completedAt: '2026-02-15T00:00:00.000Z' },
    ])
    mockByPlatform = { bga: { alice: { tags: ['friend'], responseSamples: [] } } }
    render(<InviteAgainButton platform="bga" gameName="Indonesia" url={URL_} />)
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('friend')).toBeInTheDocument()
    expect(screen.getByText(/2× together/)).toBeInTheDocument()
    expect(screen.getByText(/1–1/)).toBeInTheDocument()
    expect(screen.getByText(/last Feb 15, 2026/)).toBeInTheDocument()
  })

  it('shows the average time to finish this title together when the platform reports start dates', () => {
    setFinishedGamesCache([
      {
        platform: 'bga', gameName: 'Indonesia', opponents: [{ name: 'alice' }],
        startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-04T00:00:00.000Z',
      },
    ])
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [] } } }
    render(<InviteAgainButton platform="bga" gameName="Indonesia" url={URL_} />)
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    expect(screen.getByText(/~3 days to finish/)).toBeInTheDocument()
  })

  it('excludes opponents hidden from the roster', () => {
    setFinishedGamesCache([{ platform: 'bga', gameName: 'Indonesia', opponents: [{ name: 'alice' }] }])
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [], hidden: true } } }
    const { container } = render(<InviteAgainButton platform="bga" gameName="Indonesia" url={URL_} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('closes on Escape and on a backdrop click', () => {
    setFinishedGamesCache([{ platform: 'bga', gameName: 'Indonesia', opponents: [{ name: 'alice' }] }])
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [] } } }
    render(<InviteAgainButton platform="bga" gameName="Indonesia" url={URL_} />)

    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('copies a single nickname to the clipboard and opens the game page when its name is clicked', async () => {
    setFinishedGamesCache([{ platform: 'yucata', gameName: 'Indonesia', opponents: [{ name: 'alice' }] }])
    mockByPlatform = { yucata: { alice: { tags: [], responseSamples: [] } } }
    render(<InviteAgainButton platform="yucata" gameName="Indonesia" url={URL_} />)
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    fireEvent.click(screen.getByRole('button', { name: 'alice' }))
    expect(windowOpen).toHaveBeenCalledWith(URL_, '_blank', 'noopener,noreferrer')
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('alice'))
    expect(await screen.findByText('Copied!')).toBeInTheDocument()
  })

  it('copies several selected nicknames at once, comma-separated, and opens the game page', async () => {
    setFinishedGamesCache([
      { platform: 'yucata', gameName: 'Indonesia', opponents: [{ name: 'alice' }] },
      { platform: 'yucata', gameName: 'Indonesia', opponents: [{ name: 'bob' }] },
    ])
    mockByPlatform = { yucata: { alice: { tags: [], responseSamples: [] }, bob: { tags: [], responseSamples: [] } } }
    render(<InviteAgainButton platform="yucata" gameName="Indonesia" url={URL_} />)
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select alice' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select bob' }))
    fireEvent.click(screen.getByRole('button', { name: /Copy 2 & open/ }))

    expect(windowOpen).toHaveBeenCalledWith(URL_, '_blank', 'noopener,noreferrer')
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('alice, bob'))
  })

  it('opens BGA in the same tab instead of a new one', async () => {
    const originalHref = window.location.href
    setFinishedGamesCache([{ platform: 'bga', gameName: 'Indonesia', opponents: [{ name: 'alice' }] }])
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [] } } }
    render(<InviteAgainButton platform="bga" gameName="Indonesia" url="#bga-play" />)
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    fireEvent.click(screen.getByRole('button', { name: 'alice' }))
    expect(windowOpen).not.toHaveBeenCalled()
    expect(window.location.href).toContain('#bga-play')
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('alice'))
    window.location.href = originalHref
  })
})
