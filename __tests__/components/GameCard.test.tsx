import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GameCard, { GameRow, GameItemProps } from '@/components/GameCard'
import { Game } from '@/lib/types'

const NOW = Date.parse('2026-06-26T10:00:00Z')

const game: Game = {
  id: 'bga:1',
  platform: 'bga',
  gameName: 'Wingspan',
  myTurn: true,
  lastMoveAt: new Date('2026-06-24T10:00:00Z'),
  lastMoveAgo: '2 days ago',
  urgent: true,
  gameUrl: 'https://boardgamearena.com/table/1',
  platformUrl: 'https://boardgamearena.com',
  players: ['alice', 'bob'],
}

const props = (over: Partial<GameItemProps> = {}): GameItemProps =>
  ({ game, pinned: false, onTogglePin: () => {}, onOpen: () => {}, opponentSlowDays: 5, now: NOW, ...over })

describe('GameCard', () => {
  it('shows game name, platform badge and time', () => {
    render(<GameCard {...props()} />)
    expect(screen.getByText('Wingspan')).toBeInTheDocument()
    expect(screen.getByText('BGA')).toBeInTheDocument()
    expect(screen.getByText(/2 days ago/)).toBeInTheDocument()
  })

  it('has no "Your turn" label — the section heading says it', () => {
    render(<GameCard {...props()} />)
    expect(screen.queryByText('Your turn')).toBeNull()
  })

  it('shows the time left when the deadline is under a day away', () => {
    render(<GameCard {...props({ game: { ...game, deadlineAt: '2026-06-26T15:00:00Z' } })} />)
    expect(screen.getByText(/5h left/)).toBeInTheDocument()
  })

  it('does not show a deadline days away', () => {
    render(<GameCard {...props({ game: { ...game, deadlineAt: '2026-06-30T10:00:00Z' } })} />)
    expect(screen.queryByText(/left/)).toBeNull()
  })

  it('calls onTogglePin when pin icon clicked', async () => {
    const onTogglePin = jest.fn()
    render(<GameCard {...props({ onTogglePin })} />)
    await userEvent.click(screen.getByRole('button', { name: /pin/i }))
    expect(onTogglePin).toHaveBeenCalledWith('bga:1')
  })

  it('makes the whole card a link to the game, and calls onOpen so the dashboard can hide it', async () => {
    const onOpen = jest.fn()
    render(<GameCard {...props({ onOpen })} />)
    const link = screen.getByRole('link', { name: 'Open Wingspan' })
    expect(link).toHaveAttribute('href', game.gameUrl)
    link.addEventListener('click', e => e.preventDefault()) // jsdom can't navigate
    await userEvent.click(link)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows a note and saves an edited one', async () => {
    const onSaveNote = jest.fn()
    render(<GameCard {...props({ note: 'build mines', onSaveNote })} />)
    await userEvent.click(screen.getByText(/build mines/))
    const input = screen.getByRole('textbox', { name: /note for wingspan/i })
    await userEvent.clear(input)
    await userEvent.type(input, 'go for trains{Enter}')
    expect(onSaveNote).toHaveBeenCalledWith('bga:1', 'go for trains')
  })
})

describe('GameRow', () => {
  const waiting: Game = { ...game, myTurn: false, currentPlayer: 'alice', lastMoveAt: new Date('2026-06-15T10:00:00Z'), lastMoveAgo: '11 days ago' }

  it('shows who is up and marks a slow opponent', () => {
    render(<GameRow {...props({ game: waiting })} />)
    expect(screen.getByText(/waiting for alice/)).toBeInTheDocument()
    expect(screen.getByText(/⏱ 11 days ago/)).toBeInTheDocument()
  })

  it('adds a note from the pencil button', async () => {
    const onSaveNote = jest.fn()
    render(<GameRow {...props({ game: waiting, onSaveNote })} />)
    await userEvent.click(screen.getByRole('button', { name: /add a note/i }))
    await userEvent.type(screen.getByRole('textbox'), 'ask alice{Enter}')
    expect(onSaveNote).toHaveBeenCalledWith('bga:1', 'ask alice')
  })
})

describe('note deletion', () => {
  it('deletes a note with the small ✕ button', async () => {
    const onSaveNote = jest.fn()
    render(<GameCard {...props({ note: 'build mines', onSaveNote })} />)
    await userEvent.click(screen.getByRole('button', { name: /delete the note/i }))
    expect(onSaveNote).toHaveBeenCalledWith('bga:1', '')
  })
})
