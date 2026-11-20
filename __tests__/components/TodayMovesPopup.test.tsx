import { useRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TodayMovesPopup from '@/components/TodayMovesPopup'
import { Game } from '@/lib/types'

function game(id: string, overrides: Partial<Game> = {}): Game {
  return {
    id, platform: 'bga', gameName: id, myTurn: true,
    lastMoveAt: new Date(), lastMoveAgo: '', urgent: false,
    gameUrl: `https://example.com/${id}`, platformUrl: '', players: [],
    ...overrides,
  }
}

function Harness({ games, onClose }: { games: Game[]; onClose: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button ref={anchorRef}>trigger</button>
      <TodayMovesPopup games={games} anchorRef={anchorRef} onClose={onClose} />
    </div>
  )
}

describe('TodayMovesPopup', () => {
  it('lists only games with moves today, busiest first', () => {
    render(<Harness games={[
      game('1', { gameName: 'Quiet Game', moveCountToday: 2 }),
      game('2', { gameName: 'No Moves', moveCountToday: 0 }),
      game('3', { gameName: 'Busy Game', moveCountToday: 9 }),
    ]} onClose={() => {}} />)
    const links = screen.getAllByRole('link')
    expect(links.map(l => l.textContent)).toEqual(['BGABusy Game9', 'BGAQuiet Game2'])
  })

  it('says so when nothing moved today', () => {
    render(<Harness games={[game('1', { moveCountToday: 0 })]} onClose={() => {}} />)
    expect(screen.getByText(/No moves yet today/)).toBeInTheDocument()
  })

  it('links each game to its own gameUrl, opening BGA in the same tab', () => {
    render(<Harness games={[
      game('1', { gameName: 'BGA Game', platform: 'bga', moveCountToday: 1, gameUrl: 'https://bga.example/1' }),
      game('2', { gameName: 'Rally Game', platform: 'rally', moveCountToday: 1, gameUrl: 'https://rally.example/2' }),
    ]} onClose={() => {}} />)
    const bga = screen.getByRole('link', { name: /BGA Game/ })
    expect(bga).toHaveAttribute('href', 'https://bga.example/1')
    expect(bga).toHaveAttribute('target', '_self')
    const rally = screen.getByRole('link', { name: /Rally Game/ })
    expect(rally).toHaveAttribute('target', '_blank')
  })

  it('closes on its own close button', async () => {
    const onClose = jest.fn()
    render(<Harness games={[game('1', { moveCountToday: 3 })]} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
