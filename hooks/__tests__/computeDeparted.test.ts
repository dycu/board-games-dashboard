import { computeDeparted, DepartedGame } from '../useGamesData'
import { Game, Platform } from '@/lib/types'

const makeGame = (id: string, platform: Platform = 'bga'): Game => ({
  id,
  platform,
  gameName: `Game ${id}`,
  myTurn: false,
  lastMoveAt: new Date(),
  lastMoveAgo: '1h ago',
  urgent: false,
  gameUrl: `https://example.com/${id}`,
  platformUrl: 'https://boardgamearena.com',
  players: [],
})

describe('computeDeparted', () => {
  it('returns game present in prev but absent in next', () => {
    const prev = [makeGame('bga:1'), makeGame('bga:2')]
    const next = [makeGame('bga:1')]
    const result = computeDeparted(prev, next, [])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('bga:2')
    expect(result[0].gameName).toBe('Game bga:2')
  })

  it('excludes departures from platforms that errored', () => {
    const prev = [makeGame('bga:1'), makeGame('obg:1', 'obg')]
    const next = [makeGame('bga:1')]
    const errors = [{ platform: 'obg' as Platform, error: 'timeout' }]
    const result = computeDeparted(prev, next, errors)
    expect(result).toHaveLength(0)
  })

  it('returns bga departure even when obg errored', () => {
    const prev = [makeGame('bga:1'), makeGame('obg:1', 'obg')]
    const next = [makeGame('obg:1', 'obg')]
    const errors = [{ platform: 'obg' as Platform, error: 'timeout' }]
    const result = computeDeparted(prev, next, errors)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('bga:1')
  })

  it('returns empty when no games departed', () => {
    const games = [makeGame('bga:1'), makeGame('bga:2')]
    expect(computeDeparted(games, games, [])).toHaveLength(0)
  })

  it('returns empty when prev is empty', () => {
    expect(computeDeparted([], [makeGame('bga:1')], [])).toHaveLength(0)
  })

  it('includes all required fields in result', () => {
    const prev = [makeGame('bga:1')]
    const result = computeDeparted(prev, [], [])
    expect(result[0]).toEqual<DepartedGame>({
      id: 'bga:1',
      gameName: 'Game bga:1',
      platform: 'bga',
      gameUrl: 'https://example.com/bga:1',
    })
  })
})
