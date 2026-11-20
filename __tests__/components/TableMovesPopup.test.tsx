import { useRef } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableMovesPopup from '@/components/TableMovesPopup'
import { Game } from '@/lib/types'

const game: Game = {
  id: 'bga:1',
  platform: 'bga',
  gameName: 'Wingspan',
  myTurn: true,
  lastMoveAt: new Date('2026-06-24T10:00:00Z'),
  lastMoveAgo: '2 days ago',
  urgent: false,
  gameUrl: 'https://boardgamearena.com/table/1',
  platformUrl: 'https://boardgamearena.com',
  players: ['alice'],
}

function mockFetch(days: unknown) {
  global.fetch = jest.fn(async () => ({ json: async () => ({ days }) })) as unknown as typeof fetch
}

// TableMovesPopup anchors itself to a trigger element (the card's dots
// button in real use) via a ref — this stands in for that trigger.
function Harness({ onClose }: { onClose: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button ref={anchorRef}>trigger</button>
      <TableMovesPopup game={game} anchorRef={anchorRef} onClose={onClose} />
    </div>
  )
}

describe('TableMovesPopup', () => {
  it("fetches this table's own history by its full id", async () => {
    mockFetch({ '2026-06-25': { me: 2, alice: 1 } })
    render(<Harness onClose={() => {}} />)
    expect(fetch).toHaveBeenCalledWith('/api/table-moves?id=bga%3A1')
    await waitFor(() => expect(screen.getByText('You')).toBeInTheDocument())
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('says so when there is no history yet', async () => {
    mockFetch({})
    render(<Harness onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/No moves recorded yet/)).toBeInTheDocument())
  })

  it('shows the aggregate "Others" key, not a raw internal name, for unresolved opponents', async () => {
    mockFetch({ '2026-06-25': { me: 1, opponents: 2 } })
    render(<Harness onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Others (unresolved)')).toBeInTheDocument())
  })

  it('closes on Escape, on the close button, and on an outside click, but not a click inside', async () => {
    mockFetch({})
    const onClose = jest.fn()
    const { unmount } = render(<Harness onClose={onClose} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()

    const onClose2 = jest.fn()
    const { unmount: unmount2 } = render(<Harness onClose={onClose2} />)
    await waitFor(() => expect(screen.getByText(/No moves recorded yet/)).toBeInTheDocument())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose2).toHaveBeenCalledTimes(1)
    unmount2()

    const onClose3 = jest.fn()
    render(<Harness onClose={onClose3} />)
    await waitFor(() => expect(screen.getByText(/No moves recorded yet/)).toBeInTheDocument())
    await userEvent.click(screen.getByText(/No moves recorded yet/))
    expect(onClose3).not.toHaveBeenCalled()
    await userEvent.click(document.body)
    expect(onClose3).toHaveBeenCalledTimes(1)
  })

  it('closes on scroll rather than tracking the trigger to a new position', async () => {
    mockFetch({})
    const onClose = jest.fn()
    render(<Harness onClose={onClose} />)
    await waitFor(() => expect(screen.getByText(/No moves recorded yet/)).toBeInTheDocument())
    fireEvent.scroll(window)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
