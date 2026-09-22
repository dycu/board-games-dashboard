import { sortAndFilter } from '@/lib/sort-filter'
import { Game, UserPrefs, DEFAULT_PREFS } from '@/lib/types'

const base = (overrides: Partial<Game>): Game => ({
  id: 'bga:1',
  platform: 'bga',
  gameName: 'Test Game',
  myTurn: false,
  lastMoveAt: new Date('2026-06-20T00:00:00Z'),
  lastMoveAgo: '6 days ago',
  urgent: true,
  gameUrl: 'https://example.com/game/1',
  platformUrl: 'https://boardgamearena.com',
  players: ['alice'],
  ...overrides,
})

const prefs = (overrides: Partial<UserPrefs> = {}): UserPrefs => ({
  ...DEFAULT_PREFS,
  ...overrides,
})

describe('sortAndFilter', () => {
  const pinned = base({ id: 'bga:pinned', myTurn: true, lastMoveAt: new Date('2026-06-25') })
  const myTurnOld = base({ id: 'bga:2', myTurn: true, lastMoveAt: new Date('2026-06-18') })
  const myTurnNew = base({ id: 'bga:3', myTurn: true, lastMoveAt: new Date('2026-06-24') })
  const waiting = base({ id: 'bga:4', myTurn: false, lastMoveAt: new Date('2026-06-22') })

  it('puts pinned+myTurn first, then myTurn by oldest, then waiting', () => {
    const result = sortAndFilter(
      [waiting, myTurnNew, myTurnOld, pinned],
      prefs({ pins: ['bga:pinned'] }),
    )
    expect(result.map(g => g.id)).toEqual(['bga:pinned', 'bga:2', 'bga:3', 'bga:4'])
  })

  it('filters to my-turn only', () => {
    const result = sortAndFilter(
      [myTurnOld, waiting],
      prefs({ filter: { turnStatus: 'my-turn', platforms: [] } }),
    )
    expect(result.every(g => g.myTurn)).toBe(true)
    expect(result).toHaveLength(1)
  })

  it('filters to waiting only', () => {
    const result = sortAndFilter(
      [myTurnOld, waiting],
      prefs({ filter: { turnStatus: 'waiting', platforms: [] } }),
    )
    expect(result.every(g => !g.myTurn)).toBe(true)
    expect(result).toHaveLength(1)
  })

  it('filters by platform', () => {
    const yucataGame = base({ id: 'yucata:1', platform: 'yucata' })
    const result = sortAndFilter(
      [myTurnOld, yucataGame],
      prefs({ filter: { turnStatus: 'all', platforms: ['yucata'] } }),
    )
    expect(result).toHaveLength(1)
    expect(result[0].platform).toBe('yucata')
  })

  it('sorts by most-recent when selected', () => {
    const result = sortAndFilter(
      [myTurnOld, myTurnNew],
      prefs({ sort: 'most-recent' }),
    )
    expect(result[0].id).toBe('bga:3')
  })

  it('keeps stale waiting games when hideStaleWaiting is off', () => {
    const stale = base({ id: 'obg:1', myTurn: false, lastMoveAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) })
    const result = sortAndFilter([stale], prefs({ hideStaleWaiting: false }))
    expect(result.map(g => g.id)).toEqual(['obg:1'])
  })

  it('hides waiting games with no move in 30+ days when hideStaleWaiting is on', () => {
    const stale = base({ id: 'obg:1', myTurn: false, lastMoveAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) })
    const recent = base({ id: 'obg:2', myTurn: false, lastMoveAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) })
    const result = sortAndFilter([stale, recent], prefs({ hideStaleWaiting: true }))
    expect(result.map(g => g.id)).toEqual(['obg:2'])
  })

  it('never hides my-turn games under hideStaleWaiting, even if old', () => {
    const staleMyTurn = base({ id: 'obg:3', myTurn: true, lastMoveAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) })
    const result = sortAndFilter([staleMyTurn], prefs({ hideStaleWaiting: true }))
    expect(result.map(g => g.id)).toEqual(['obg:3'])
  })
})
