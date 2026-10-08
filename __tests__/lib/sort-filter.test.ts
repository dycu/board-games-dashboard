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

  it('puts pinned games first, then games about to time out, soonest first', () => {
    const now = Date.parse('2026-10-08T12:00:00Z')
    const in5h = base({ id: 'bga:10', myTurn: true, deadlineAt: '2026-10-08T17:00:00Z' })
    const in2h = base({ id: 'bga:11', myTurn: true, deadlineAt: '2026-10-08T14:00:00Z' })
    const in3d = base({ id: 'bga:12', myTurn: true, deadlineAt: '2026-10-11T12:00:00Z' })
    const pinned = base({ id: 'bga:13', myTurn: true })
    const result = sortAndFilter([pinned, in3d, in5h, in2h], prefs({ pins: ['bga:13'] }), now)
    expect(result.map(g => g.id)).toEqual(['bga:13', 'bga:11', 'bga:10', 'bga:12'])
  })

  it('does not move a game with most of a day left ahead of games that waited longer', () => {
    const now = Date.parse('2026-10-08T12:00:00Z')
    const bgaDay = base({ id: 'bga:20', myTurn: true, deadlineAt: '2026-10-09T08:00:00Z', lastMoveAt: new Date('2026-10-08T10:00:00Z') })
    const obgOld = base({ id: 'obg:21', platform: 'obg', myTurn: true, lastMoveAt: new Date('2026-10-06T10:00:00Z') })
    expect(sortAndFilter([bgaDay, obgOld], prefs(), now).map(g => g.id)).toEqual(['obg:21', 'bga:20'])
  })

  it('puts an overdue game first', () => {
    const now = Date.parse('2026-10-08T12:00:00Z')
    const overdue = base({ id: 'obg:30', platform: 'obg', myTurn: true, deadlineAt: '2026-10-07T21:00:00Z', lastMoveAt: new Date('2026-10-07T09:00:00Z') })
    const older = base({ id: 'bga:31', myTurn: true, lastMoveAt: new Date('2026-10-01T10:00:00Z') })
    expect(sortAndFilter([older, overdue], prefs(), now).map(g => g.id)).toEqual(['obg:30', 'bga:31'])
  })
})
