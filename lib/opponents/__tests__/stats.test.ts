import { globalOpponents, gamesWith } from '../stats'
import { FinishedGame, Platform } from '../../types'
import { OpponentEntry } from '../store'

const day = (d: number) => new Date(Date.UTC(2026, 8, d))

const fg = (id: string, platform: Platform, d: number, over: Partial<FinishedGame> = {}): FinishedGame => ({
  id, platform, gameName: 'Next Station', completedAt: day(d), completedAgo: '', gameUrl: '', ...over,
})

describe('globalOpponents', () => {
  const games = [
    fg('1', 'bga', 1, { result: 'won', rank: 1, opponents: [{ name: 'Alice', rank: 2 }] }),
    fg('2', 'bga', 5, { result: 'lost', rank: 2, opponents: [{ name: 'Alice', rank: 1 }] }),
    // Same name, different platform — must not merge with BGA's Alice
    fg('3', 'yucata', 3, { result: 'won', rank: 1, opponents: [{ name: 'Alice', rank: 2 }] }),
  ]

  it('keys by platform + name, so the same name on two sites stays separate', () => {
    const result = globalOpponents(games, {})
    expect(result.map(o => `${o.platform}:${o.name}:${o.games}`).sort()).toEqual([
      'bga:Alice:2', 'yucata:Alice:1',
    ])
  })

  it('carries the head-to-head record and last-played date', () => {
    const [bgaAlice] = globalOpponents(games, {}).filter(o => o.platform === 'bga')
    expect(bgaAlice).toMatchObject({ games: 2, iWon: 1, theyWon: 1 })
    expect(bgaAlice.lastPlayedAt).toEqual(day(5))
  })

  it('merges in tags and response samples from the stored entry, with the median computed', () => {
    const entriesByPlatform = { bga: { Alice: { tags: ['fast'], responseSamples: [3600, 7200, 10800] } as OpponentEntry } }
    const [bgaAlice] = globalOpponents(games, entriesByPlatform).filter(o => o.platform === 'bga')
    expect(bgaAlice.tags).toEqual(['fast'])
    expect(bgaAlice.medianResponseSeconds).toBe(7200)
  })

  it('sorts by games played, most first', () => {
    const result = globalOpponents(games, {})
    expect(result[0].games).toBeGreaterThanOrEqual(result[1].games)
  })

  it('includes a tagged opponent with no finished games against them yet', () => {
    const entriesByPlatform = { obg: { Bob: { tags: ['reliable'], responseSamples: [] } as OpponentEntry } }
    const result = globalOpponents([], entriesByPlatform)
    expect(result).toEqual([{
      platform: 'obg', name: 'Bob', games: 0, iWon: 0, theyWon: 0, lastPlayedAt: null,
      tags: ['reliable'], responseSamples: [], medianResponseSeconds: null,
    }])
  })

  it('omits a stored entry with neither tags nor samples and no games — nothing to show', () => {
    const entriesByPlatform = { obg: { Carol: { tags: [], responseSamples: [] } as OpponentEntry } }
    expect(globalOpponents([], entriesByPlatform)).toEqual([])
  })
})

describe('gamesWith', () => {
  it('finds every finished game against one platform + name opponent, newest first', () => {
    const games = [
      fg('1', 'bga', 1, { opponents: [{ name: 'Alice' }] }),
      fg('2', 'bga', 9, { opponents: [{ name: 'Alice' }] }),
      fg('3', 'bga', 5, { opponents: [{ name: 'Bob' }] }),
      fg('4', 'yucata', 9, { opponents: [{ name: 'Alice' }] }),
    ]
    expect(gamesWith(games, 'bga', 'alice').map(g => g.id)).toEqual(['2', '1'])
  })
})
