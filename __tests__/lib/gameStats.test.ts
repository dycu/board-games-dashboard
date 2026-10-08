import { gameStats, gamesOf, gameHistoryHref } from '@/lib/gameStats'
import { FinishedGame } from '@/lib/types'

const day = (d: number) => new Date(Date.UTC(2026, 8, d))

const fg = (id: string, d: number, over: Partial<FinishedGame> = {}): FinishedGame => ({
  id, platform: 'bga', gameName: 'Next Station', completedAt: day(d), completedAgo: '', gameUrl: '', ...over,
})

describe('gameStats', () => {
  const games = [
    fg('1', 1, { result: 'won', rank: 1, playerCount: 2, elo: 1320, startedAt: day(0).toISOString(), opponents: [{ name: 'alice', rank: 2 }] }),
    fg('2', 5, { result: 'lost', rank: 2, playerCount: 2, elo: 1310, startedAt: day(2).toISOString(), opponents: [{ name: 'Alice', rank: 1 }] }),
    fg('3', 9, { result: 'lost', rank: 3, playerCount: 3, elo: 1305, opponents: [{ name: 'bob', rank: 1 }, { name: 'alice', rank: 2 }] }),
    fg('4', 3, { result: 'coop', rank: 1, playerCount: 3, opponents: [{ name: 'bob', rank: 1 }] }),
  ]

  it('counts plays, dates, results, places and ELO', () => {
    const s = gameStats(games)
    expect(s.plays).toBe(4)
    expect(s.first).toEqual(day(1))
    expect(s.last).toEqual(day(9))
    expect(s.results).toMatchObject({ won: 1, lost: 2, coop: 1 })
    expect(s.winRate).toBeCloseTo(1 / 3)
    expect(s.avgRank).toBe(2)
    expect(s.eloNow).toBe(1305)
    expect(s.eloBest).toBe(1320)
    expect(s.eloSeries.map(p => p.elo)).toEqual([1320, 1310, 1305])
    expect(s.avgDurationDays).toBe(2)
    expect(s.usualPlayerCount).toBe(2) // 2 and 3 players tie at two games each; the smaller table wins the tie
  })

  it('keeps a head-to-head record per opponent, case-insensitively', () => {
    const s = gameStats(games)
    expect(s.opponents).toEqual([
      { name: 'alice', games: 3, iWon: 1, theyWon: 2 },
      { name: 'bob', games: 2, iWon: 0, theyWon: 1 },
    ])
  })

  it('handles a game with only dates', () => {
    const s = gameStats([fg('x', 4, { platform: 'rally' })])
    expect(s.plays).toBe(1)
    expect(s.winRate).toBeNull()
    expect(s.eloNow).toBeNull()
    expect(s.opponents).toEqual([])
  })
})

describe('gamesOf / gameHistoryHref', () => {
  it('groups table titles under their game type', () => {
    const all = [fg('a', 1, { platform: 'obg', gameName: 'Indonesia — My table', gameType: 'Indonesia' }), fg('b', 2, { platform: 'obg', gameName: 'indonesia' }), fg('c', 3)]
    expect(gamesOf(all, 'obg', 'Indonesia').map(g => g.id)).toEqual(['a', 'b'])
  })

  it('links with the BGA game key when there is one', () => {
    expect(gameHistoryHref({ platform: 'bga', gameName: 'The Crew', gameKey: '1248' })).toBe('/history/game?platform=bga&name=The+Crew&key=1248')
  })
})
