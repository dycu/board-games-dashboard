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
    expect(screen.getByText('18xx.games')).toBeInTheDocument()
  })
})
