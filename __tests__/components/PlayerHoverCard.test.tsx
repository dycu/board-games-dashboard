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

beforeEach(() => {
  mockByPlatform = null
  setPointerCoarse(false)
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
})
