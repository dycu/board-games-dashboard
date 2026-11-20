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

describe('TableMovesPopup', () => {
  it('fetches this table\'s own history by its full id', async () => {
    mockFetch({ '2026-06-25': { me: 2, alice: 1 } })
    render(<TableMovesPopup game={game} onClose={() => {}} />)
    expect(fetch).toHaveBeenCalledWith('/api/table-moves?id=bga%3A1')
    await waitFor(() => expect(screen.getByText('You')).toBeInTheDocument())
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('says so when there is no history yet', async () => {
    mockFetch({})
    render(<TableMovesPopup game={game} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/No moves recorded yet/)).toBeInTheDocument())
  })

  it('shows the aggregate "Others" key, not a raw internal name, for unresolved opponents', async () => {
    mockFetch({ '2026-06-25': { me: 1, opponents: 2 } })
    render(<TableMovesPopup game={game} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Others (unresolved)')).toBeInTheDocument())
  })

  it('closes on Escape, on the close button, and on a backdrop click, but not a click inside', async () => {
    mockFetch({})
    const onClose = jest.fn()
    const { unmount } = render(<TableMovesPopup game={game} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()

    const onClose2 = jest.fn()
    const { unmount: unmount2 } = render(<TableMovesPopup game={game} onClose={onClose2} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose2).toHaveBeenCalledTimes(1)
    unmount2()

    const onClose3 = jest.fn()
    render(<TableMovesPopup game={game} onClose={onClose3} />)
    await userEvent.click(screen.getByRole('dialog'))
    expect(onClose3).not.toHaveBeenCalled()
  })
})
