import { mergePlatformRefresh, departureCheckErrors } from '../useGamesData'
import { Game } from '@/lib/types'

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
    platformUrl: 'https://example.com',
    players: [],
  }
}

describe('mergePlatformRefresh', () => {
  it('keeps every other platform untouched, replacing only the refreshed one', () => {
    const untouchedRallyGame = makeGame('rally', '2')
    const previous = {
      games: [makeGame('bga', '1'), untouchedRallyGame],
      errors: [{ platform: 'hansa' as const, error: 'down' }],
      fetchedAt: 'old',
      platforms: ['bga', 'rally', 'hansa'] as Game['platform'][],
    }
    const fresh = [makeGame('bga', '1'), makeGame('bga', '3')]
    const merged = mergePlatformRefresh(previous, ['bga'], fresh, [], 'new')

    expect(merged.games).toEqual([untouchedRallyGame, ...fresh])
    expect(merged.errors).toEqual([{ platform: 'hansa', error: 'down' }])
    expect(merged.fetchedAt).toBe('new')
    expect(merged.platforms).toEqual(['bga', 'rally', 'hansa']) // the filter bar keeps every configured platform
  })

  it('replaces a previous error for the refreshed platform once it succeeds', () => {
    const previous = {
      games: [],
      errors: [{ platform: 'bga' as const, error: 'timed out' }],
      fetchedAt: 'old',
      platforms: ['bga'] as Game['platform'][],
    }
    const merged = mergePlatformRefresh(previous, ['bga'], [makeGame('bga', '1')], [], 'new')
    expect(merged.errors).toEqual([])
  })

  it('falls back to a plain full result when there is nothing cached to merge into', () => {
    const fresh = [makeGame('bga', '1')]
    const merged = mergePlatformRefresh(null, ['bga'], fresh, [], 'new')
    expect(merged).toEqual({ games: fresh, errors: [], fetchedAt: 'new', platforms: ['bga'] })
  })
})

describe('departureCheckErrors', () => {
  it('treats every platform outside the refresh as if it had errored, so it is never judged departed', () => {
    const result = departureCheckErrors([], ['bga', 'rally', 'hansa'], ['bga'])
    expect(result).toEqual([
      { platform: 'rally', error: 'not fetched this round' },
      { platform: 'hansa', error: 'not fetched this round' },
    ])
  })

  it('keeps a real error for the refreshed platform alongside the synthetic ones', () => {
    const result = departureCheckErrors([{ platform: 'bga', error: 'boom' }], ['bga', 'rally'], ['bga'])
    expect(result).toEqual([
      { platform: 'bga', error: 'boom' },
      { platform: 'rally', error: 'not fetched this round' },
    ])
  })

  it('adds nothing extra when every known platform was part of this refresh', () => {
    expect(departureCheckErrors([], ['bga'], ['bga'])).toEqual([])
  })
})
