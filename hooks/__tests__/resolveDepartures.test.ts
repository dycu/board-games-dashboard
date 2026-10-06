import { resolveDepartures, DepartedGame } from '../useGamesData'
import { Game, Platform } from '@/lib/types'

const makeGame = (id: string, platform: Platform = 'yucata'): Game => ({
  id,
  platform,
  gameName: `Game ${id}`,
  myTurn: false,
  lastMoveAt: new Date(),
  lastMoveAgo: '1h ago',
  urgent: false,
  gameUrl: `https://example.com/${id}`,
  platformUrl: 'https://example.com',
  players: [],
})

const departed = (id: string, platform: Platform = 'yucata'): DepartedGame => ({
  id, platform, gameName: `Game ${id}`, gameUrl: `https://example.com/${id}`,
})

const timeout = (platform: Platform) => [{ platform, error: 'timeout' }]

describe('resolveDepartures', () => {
  it('a game missing for the first time is pending, not confirmed', () => {
    const result = resolveDepartures([makeGame('yucata:1'), makeGame('yucata:2')], [], [makeGame('yucata:1')], [])
    expect(result.confirmed).toEqual([])
    expect(result.pending).toEqual([departed('yucata:2')])
  })

  it('confirms a pending game still missing on the next fetch', () => {
    const result = resolveDepartures([makeGame('yucata:1')], [departed('yucata:2')], [makeGame('yucata:1')], [])
    expect(result.confirmed).toEqual([departed('yucata:2')])
    expect(result.pending).toEqual([])
  })

  it('drops a pending game that reappears (transient omission)', () => {
    const result = resolveDepartures([makeGame('yucata:1')], [departed('yucata:2')], [makeGame('yucata:1'), makeGame('yucata:2')], [])
    expect(result.confirmed).toEqual([])
    expect(result.pending).toEqual([])
  })

  it('keeps a pending game pending while its platform errors', () => {
    const result = resolveDepartures([], [departed('yucata:2')], [], timeout('yucata'))
    expect(result.confirmed).toEqual([])
    expect(result.pending).toEqual([departed('yucata:2')])
  })

  it('does not mark games pending from a platform that errored', () => {
    const result = resolveDepartures([makeGame('obg:1', 'obg')], [], [], timeout('obg'))
    expect(result.pending).toEqual([])
  })

  it('handles new misses and confirmations in the same fetch', () => {
    const result = resolveDepartures([makeGame('bga:1', 'bga')], [departed('yucata:2')], [], [])
    expect(result.confirmed).toEqual([departed('yucata:2')])
    expect(result.pending).toEqual([departed('bga:1', 'bga')])
  })
})
