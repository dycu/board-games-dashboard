import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GameCard from '@/components/GameCard'
import { Game } from '@/lib/types'

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

describe('GameCard', () => {
  it('shows game name and platform badge', () => {
    render(<GameCard game={game} pinned={false} onTogglePin={() => {}} onOpen={() => {}} opponentSlowDays={5} />)
    expect(screen.getByText('Wingspan')).toBeInTheDocument()
    expect(screen.getByText('BGA')).toBeInTheDocument()
  })

  it('shows "Your turn" pill when myTurn is true', () => {
    render(<GameCard game={game} pinned={false} onTogglePin={() => {}} onOpen={() => {}} opponentSlowDays={5} />)
    expect(screen.getByText('Your turn')).toBeInTheDocument()
  })

  it('shows urgent indicator', () => {
    render(<GameCard game={game} pinned={false} onTogglePin={() => {}} onOpen={() => {}} opponentSlowDays={5} />)
    expect(screen.getByText(/2 days ago/)).toBeInTheDocument()
  })

  it('calls onTogglePin when pin icon clicked', async () => {
    const onTogglePin = jest.fn()
    render(<GameCard game={game} pinned={false} onTogglePin={onTogglePin} onOpen={() => {}} opponentSlowDays={5} />)

    await userEvent.click(screen.getByRole('button', { name: /pin/i }))
    expect(onTogglePin).toHaveBeenCalledWith('bga:1')
  })

  it('open button links to gameUrl', () => {
    render(<GameCard game={game} pinned={false} onTogglePin={() => {}} onOpen={() => {}} opponentSlowDays={5} />)
    const link = screen.getByRole('link', { name: /open/i })
    expect(link).toHaveAttribute('href', game.gameUrl)
  })

  it('calls onOpen when the game is opened, so the dashboard can hide it', async () => {
    const onOpen = jest.fn()
    render(<GameCard game={game} pinned={false} onTogglePin={() => {}} onOpen={onOpen} opponentSlowDays={5} />)
    const link = screen.getByRole('link', { name: /open/i })
    link.addEventListener('click', e => e.preventDefault()) // jsdom can't navigate
    await userEvent.click(link)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('has no Done button', () => {
    render(<GameCard game={game} pinned={false} onTogglePin={() => {}} onOpen={() => {}} opponentSlowDays={5} />)
    expect(screen.queryByRole('button', { name: /done/i })).toBeNull()
  })
})
