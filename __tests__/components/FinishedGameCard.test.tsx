/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import FinishedGameCard from '@/components/FinishedGameCard'
import { FinishedGame } from '@/lib/types'

const game: FinishedGame = {
  id: 'eighteenxx:333',
  platform: 'eighteenxx',
  gameName: '1830: Railways & Robber Barons',
  completedAt: new Date('2026-06-01T00:00:00Z'),
  completedAgo: '4 weeks ago',
  gameUrl: 'https://18xx.games/game/333',
}

describe('FinishedGameCard', () => {
  it('renders game name and completedAgo', () => {
    render(<FinishedGameCard game={game} />)
    expect(screen.getByText('1830: Railways & Robber Barons')).toBeInTheDocument()
    expect(screen.getByText(/4 weeks ago/)).toBeInTheDocument()
  })

  it('renders View link opening in new tab', () => {
    render(<FinishedGameCard game={game} />)
    const link = screen.getByRole('link', { name: /view/i })
    expect(link).toHaveAttribute('href', 'https://18xx.games/game/333')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('renders platform badge label', () => {
    render(<FinishedGameCard game={game} />)
    // short label, full name on hover
    expect(screen.getByText('18xx')).toHaveAttribute('title', '18xx.games')
  })

  it('opens BGA links in the same tab to trigger desktop mode', () => {
    const bgaGame: FinishedGame = {
      ...game,
      id: 'bga:55555',
      platform: 'bga',
      gameUrl: 'https://boardgamearena.com/en/brass?table=55555',
    }
    render(<FinishedGameCard game={bgaGame} />)
    const link = screen.getByRole('link', { name: /view/i })
    expect(link).toHaveAttribute('target', '_self')
  })

  it('wraps a long custom table title instead of cutting it off with an ellipsis', () => {
    const longName = "Napoleon's Triumph — Game 04 - Asynchronous, please join if you're around"
    render(<FinishedGameCard game={{ ...game, gameName: longName }} />)
    const link = screen.getByRole('link', { name: longName })
    expect(link.className).not.toMatch(/\btruncate\b/)
  })
})

describe('FinishedGameCard results', () => {
  it('shows place and ELO change', () => {
    render(<FinishedGameCard game={{ ...game, platform: 'bga', result: 'won', rank: 1, playerCount: 3, elo: 1339, eloDelta: 38 }} />)
    expect(screen.getByText(/1st of 3/)).toBeInTheDocument()
    expect(screen.getByText(/ELO 1339 \(\+38\)/)).toBeInTheDocument()
  })
})
