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
    render(<GameCard game={game} pinned={false} onTogglePin={() => {}} onDismiss={() => {}} opened={false} onOpen={() => {}} opponentSlowDays={5} />)
    expect(screen.getByText('Wingspan')).toBeInTheDocument()
    expect(screen.getByText('BGA')).toBeInTheDocument()
  })

  it('shows "Your turn" pill when myTurn is true', () => {
    render(<GameCard game={game} pinned={false} onTogglePin={() => {}} onDismiss={() => {}} opened={false} onOpen={() => {}} opponentSlowDays={5} />)
    expect(screen.getByText('Your turn')).toBeInTheDocument()
  })

  it('shows urgent indicator', () => {
    render(<GameCard game={game} pinned={false} onTogglePin={() => {}} onDismiss={() => {}} opened={false} onOpen={() => {}} opponentSlowDays={5} />)
    expect(screen.getByText(/2 days ago/)).toBeInTheDocument()
  })

  it('calls onTogglePin when pin icon clicked', async () => {
    const onTogglePin = jest.fn()
    render(<GameCard game={game} pinned={false} onTogglePin={onTogglePin} onDismiss={() => {}} opened={false} onOpen={() => {}} opponentSlowDays={5} />)

    await userEvent.click(screen.getByRole('button', { name: /pin/i }))
    expect(onTogglePin).toHaveBeenCalledWith('bga:1')
  })

  it('open button links to gameUrl', () => {
    render(<GameCard game={game} pinned={false} onTogglePin={() => {}} onDismiss={() => {}} opened={false} onOpen={() => {}} opponentSlowDays={5} />)
    const link = screen.getByRole('link', { name: /open/i })
    expect(link).toHaveAttribute('href', game.gameUrl)
  })

  it('opens non-BGA games in a dedicated popup window instead of navigating the tab', async () => {
    const yucataGame: Game = { ...game, id: 'yucata:1', platform: 'yucata', gameUrl: 'https://yucata.de/en/game/1' }
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    render(<GameCard game={yucataGame} pinned={false} onTogglePin={() => {}} onDismiss={() => {}} opened={false} onOpen={() => {}} opponentSlowDays={5} />)

    await userEvent.click(screen.getByRole('link', { name: /open/i }))
    expect(openSpy).toHaveBeenCalledWith('https://yucata.de/en/game/1', 'game-yucata:1', expect.stringContaining('width='))
    openSpy.mockRestore()
  })

  it('leaves BGA games on same-tab navigation (no popup window) to preserve mobile desktop-mode', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    render(<GameCard game={game} pinned={false} onTogglePin={() => {}} onDismiss={() => {}} opened={false} onOpen={() => {}} opponentSlowDays={5} />)

    const link = screen.getByRole('link', { name: /open/i })
    expect(link).toHaveAttribute('target', '_self')
    await userEvent.click(link)
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })
})
