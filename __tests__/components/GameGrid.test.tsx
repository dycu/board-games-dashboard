import { render, screen } from '@testing-library/react'
import GameGrid from '@/components/GameGrid'
import { GamesApiResponse, DEFAULT_PREFS, PLATFORM_URLS, Game } from '@/lib/types'

function makeGame(platform: Game['platform'], id: string): Game {
  return {
    id: `${platform}:${id}`,
    platform,
    gameName: 'Test Game',
    myTurn: true,
    lastMoveAt: new Date(),
    lastMoveAgo: '1h ago',
    urgent: false,
    gameUrl: `https://example.com/game/${id}`,
    platformUrl: PLATFORM_URLS[platform],
    players: [],
  }
}

describe('GameGrid quick-links bar', () => {
  it('renders a link for each platform present in games', () => {
    const data: GamesApiResponse = {
      games: [makeGame('bga', '1'), makeGame('yucata', '2')],
      errors: [],
      fetchedAt: new Date().toISOString(),
    }
    render(
      <GameGrid
        data={data}
        prefs={DEFAULT_PREFS}
        onPrefsChange={() => {}}
        dismissed={new Set()}
        onDismiss={() => {}}
      />
    )
    const bgaLink = screen.getByRole('link', { name: 'BGA' })
    expect(bgaLink).toHaveAttribute('href', PLATFORM_URLS.bga)
    const yucataLink = screen.getByRole('link', { name: 'Yucata' })
    expect(yucataLink).toHaveAttribute('href', PLATFORM_URLS.yucata)
  })

  it('includes platforms that errored (no games returned)', () => {
    const data: GamesApiResponse = {
      games: [makeGame('bga', '1')],
      errors: [{ platform: 'rally', error: 'timeout' }],
      fetchedAt: new Date().toISOString(),
    }
    render(
      <GameGrid
        data={data}
        prefs={DEFAULT_PREFS}
        onPrefsChange={() => {}}
        dismissed={new Set()}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByRole('link', { name: 'Rally the Troops' })).toHaveAttribute(
      'href',
      PLATFORM_URLS.rally,
    )
  })

  it('does not duplicate a platform that has both games and an error entry', () => {
    const data: GamesApiResponse = {
      games: [makeGame('bga', '1'), makeGame('bga', '2')],
      errors: [{ platform: 'bga', error: 'partial' }],
      fetchedAt: new Date().toISOString(),
    }
    render(
      <GameGrid
        data={data}
        prefs={DEFAULT_PREFS}
        onPrefsChange={() => {}}
        dismissed={new Set()}
        onDismiss={() => {}}
      />
    )
    expect(screen.getAllByRole('link', { name: 'BGA' })).toHaveLength(1)
  })
})
