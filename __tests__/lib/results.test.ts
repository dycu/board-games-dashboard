import { resultFromRanks, ordinal, placeLabel, withEloDeltas, summarizeResults } from '@/lib/results'

describe('resultFromRanks', () => {
  it('wins on first place, draws when everyone is first, otherwise loses', () => {
    expect(resultFromRanks(1, [1, 2, 3])).toBe('won')
    expect(resultFromRanks(1, [1, 1, 3])).toBe('won')
    expect(resultFromRanks(1, [1, 1])).toBe('draw')
    expect(resultFromRanks(2, [1, 2])).toBe('lost')
  })
})

describe('ordinal / placeLabel', () => {
  it('formats places', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'])
    expect(placeLabel({ result: 'lost', rank: 3, playerCount: 4 })).toBe('3rd of 4')
    expect(placeLabel({ result: 'coop', rank: 1, playerCount: 2 })).toBe('co-op')
    expect(placeLabel({})).toBeNull()
  })
})

describe('withEloDeltas', () => {
  it('diffs each game against the previous one of the same game, by time', () => {
    const g = (name: string, day: number, elo?: number) => ({ gameName: name, completedAt: new Date(2026, 9, day), elo })
    const out = withEloDeltas([g('A', 3, 1340), g('B', 2, 1400), g('A', 1, 1300), g('A', 2)])
    expect(out.map(x => (x as { eloDelta?: number }).eloDelta)).toEqual([40, undefined, undefined, undefined])
  })
})

describe('summarizeResults', () => {
  it('counts games with a known result', () => {
    expect(summarizeResults([{ result: 'won' }, { result: 'lost' }, { result: 'lost' }, { result: 'coop' }, {}]))
      .toEqual({ played: 4, won: 1, lost: 2, draws: 0, coop: 1 })
  })
})
