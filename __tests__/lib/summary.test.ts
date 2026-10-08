import { summarizePeriod, presetRange } from '@/lib/summary'
import { FinishedGame } from '@/lib/types'

const day = (d: number) => new Date(Date.UTC(2026, 9, d, 12))

const fg = (id: string, d: number, over: Partial<FinishedGame> = {}): FinishedGame => ({
  id, platform: 'bga', gameName: 'Next Station', completedAt: day(d), completedAgo: '', gameUrl: '', ...over,
})

describe('summarizePeriod', () => {
  const games = [
    fg('1', 1, { result: 'won', elo: 1320, eloDelta: 20 }),
    fg('2', 5, { result: 'lost', elo: 1310, eloDelta: -10 }),
    fg('3', 6, { result: 'won', elo: 1340, eloDelta: 30 }),
    fg('4', 6, { platform: 'yucata', gameName: 'Navegador', result: 'lost' }),
    fg('5', 7, { gameName: 'The Crew', result: 'coop' }),
    fg('0', 0, { completedAt: new Date(0) }), // unknown finish time
  ]

  it('counts results, win rate and per-game breakdown for the period', () => {
    const s = summarizePeriod(games, day(4), day(8))
    expect(s.games.map(g => g.id)).toEqual(['5', '3', '4', '2'])
    expect(s.results).toEqual({ played: 4, won: 1, lost: 2, draws: 0, coop: 1 })
    expect(s.winRate).toBeCloseTo(1 / 3)
    expect(s.byGame[0]).toEqual({ platform: 'bga', gameName: 'Next Station', played: 2, won: 1, lost: 1, eloChange: 20, eloNow: 1340 })
    expect(s.eloChange).toBe(20)
  })

  it('flags platforms whose history may not reach back to the period start', () => {
    const many = Array.from({ length: 25 }, (_, i) => fg(`m${i}`, 10 + (i % 5)))
    const s = summarizePeriod([...many, fg('y', 1, { platform: 'yucata' })], day(1), day(20))
    expect(s.partial).toEqual([{ platform: 'bga', since: day(10) }])
  })

  it('is empty for a quiet period', () => {
    const s = summarizePeriod(games, day(20), day(25))
    expect(s.games).toEqual([])
    expect(s.winRate).toBeNull()
    expect(s.eloChange).toBeNull()
  })
})

describe('presetRange', () => {
  it('covers the last 7 days and the calendar month so far', () => {
    const now = new Date(2026, 9, 18, 15)
    expect(presetRange('7d', now).from).toEqual(new Date(now.getTime() - 7 * 86_400_000))
    expect(presetRange('month', now).from).toEqual(new Date(2026, 9, 1))
  })
})
