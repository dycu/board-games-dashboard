import { render, screen, fireEvent } from '@testing-library/react'
import PlayerHoverCard from '@/components/PlayerHoverCard'

let mockByPlatform: Record<string, Record<string, { tags: string[]; responseSamples: number[]; avatarUrl?: string }>> | null = null

jest.mock('@/components/OpponentsProvider', () => ({
  useOpponentsContext: () => ({ byPlatform: mockByPlatform }),
}))

function setPointerCoarse(coarse: boolean) {
  (window.matchMedia as jest.Mock) = jest.fn().mockImplementation((query: string) => ({
    matches: coarse,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function setFinishedGamesCache(games: { platform: string; opponents: { name: string }[] }[]) {
  localStorage.setItem('finished-games-cache', JSON.stringify({
    games: games.map((g, i) => ({ id: `g${i}`, gameName: 'Test Game', completedAt: '2026-01-01T00:00:00.000Z', completedAgo: '1 day ago', gameUrl: 'https://x', ...g })),
    errors: [],
    fetchedAt: '2026-01-01T00:00:00.000Z',
  }))
}

beforeEach(() => {
  mockByPlatform = null
  setPointerCoarse(false)
  localStorage.clear()
})

describe('PlayerHoverCard', () => {
  it('renders a plain link to the player page when nothing is hovered or tapped', () => {
    render(<PlayerHoverCard platform="bga" name="alice" />)
    const link = screen.getByRole('link', { name: 'alice' })
    expect(link).toHaveAttribute('href', '/players?platform=bga&name=alice')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens the card on hover (mouse) and closes it when the pointer leaves', () => {
    render(<PlayerHoverCard platform="bga" name="alice" />)
    const link = screen.getByRole('link', { name: 'alice' })
    fireEvent.mouseEnter(link)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(link)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows tags and the typical reply time from the opponents data once open', () => {
    mockByPlatform = { bga: { alice: { tags: ['friend', 'fast'], responseSamples: [3600, 7200, 10800] } } }
    render(<PlayerHoverCard platform="bga" name="alice" />)
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'alice' }))
    expect(screen.getByText('friend')).toBeInTheDocument()
    expect(screen.getByText('fast')).toBeInTheDocument()
    expect(screen.getByText(/Typically replies in ~2 hours/)).toBeInTheDocument()
  })

  it('shows a games-together count from whatever finished-games cache is already in localStorage', () => {
    setFinishedGamesCache([
      { platform: 'bga', opponents: [{ name: 'alice' }] },
      { platform: 'bga', opponents: [{ name: 'alice' }] },
      { platform: 'bga', opponents: [{ name: 'bob' }] },
      { platform: 'yucata', opponents: [{ name: 'alice' }] },
    ])
    render(<PlayerHoverCard platform="bga" name="alice" />)
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'alice' }))
    expect(screen.getByText('2 games together')).toBeInTheDocument()
  })

  it('shows nothing for the games-together count when no finished-games cache exists yet', () => {
    render(<PlayerHoverCard platform="bga" name="alice" />)
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'alice' }))
    expect(screen.queryByText(/games? together/)).toBeNull()
  })

  it('a click on a mouse device navigates normally, without opening the card first', () => {
    render(<PlayerHoverCard platform="bga" name="alice" />)
    const link = screen.getByRole('link', { name: 'alice' }) as HTMLAnchorElement
    const event = fireEvent.click(link)
    expect(event).toBe(true) // not cancelled — default navigation proceeds
  })

  it('on a touch device, tapping the name opens the card instead of navigating', () => {
    setPointerCoarse(true)
    render(<PlayerHoverCard platform="bga" name="alice" />)
    const link = screen.getByRole('link', { name: 'alice' })
    const event = fireEvent.click(link)
    expect(event).toBe(false) // preventDefault called — navigation cancelled
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('on a touch device, a second tap on the name closes the card again', () => {
    setPointerCoarse(true)
    render(<PlayerHoverCard platform="bga" name="alice" />)
    const link = screen.getByRole('link', { name: 'alice' })
    fireEvent.click(link)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.click(link)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('on a touch device, tapping outside the open card closes it', () => {
    setPointerCoarse(true)
    render(
      <div>
        <PlayerHoverCard platform="bga" name="alice" />
        <button>elsewhere</button>
      </div>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'alice' }))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('the "View profile" link inside the open card points to the same player page', () => {
    render(<PlayerHoverCard platform="bga" name="alice" />)
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'alice' }))
    expect(screen.getByRole('link', { name: /View profile/ })).toHaveAttribute('href', '/players?platform=bga&name=alice')
  })

  it('bolds the name when highlighted', () => {
    render(<PlayerHoverCard platform="bga" name="alice" highlighted />)
    expect(screen.getByRole('link', { name: 'alice' })).toHaveClass('font-semibold')
  })

  it("shows the tracked opponent's avatar next to the name even when no avatarUrl prop is passed", () => {
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [], avatarUrl: 'https://example.com/alice.jpg' } } }
    render(<PlayerHoverCard platform="bga" name="alice" />)
    const link = screen.getByRole('link', { name: 'alice' })
    const img = link.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://example.com/alice.jpg')
    // same picture reused for the bigger avatar once the card opens (it's
    // portaled to document.body, not a descendant of the trigger link)
    fireEvent.mouseEnter(link)
    expect(document.body.querySelectorAll('img[src="https://example.com/alice.jpg"]')).toHaveLength(2)
  })

  it('prefers an explicitly passed avatarUrl over the tracked one', () => {
    mockByPlatform = { bga: { alice: { tags: [], responseSamples: [], avatarUrl: 'https://example.com/tracked.jpg' } } }
    render(<PlayerHoverCard platform="bga" name="alice" avatarUrl="https://example.com/explicit.jpg" />)
    const img = screen.getByRole('link', { name: 'alice' }).querySelector('img')
    expect(img).toHaveAttribute('src', 'https://example.com/explicit.jpg')
  })
})
