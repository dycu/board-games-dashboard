import { globalOpponents, gamesWith, externalProfileUrl } from '../stats'
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
    const entriesByPlatform = { bga: { Bob: { tags: ['reliable'], responseSamples: [] } as OpponentEntry } }
    const result = globalOpponents([], entriesByPlatform)
    expect(result).toEqual([{
      platform: 'bga', name: 'Bob', games: 0, iWon: 0, theyWon: 0, lastPlayedAt: null,
      tags: ['reliable'], responseSamples: [], medianResponseSeconds: null,
    }])
  })

  it('omits a stored entry with neither tags nor samples and no games — nothing to show', () => {
    const entriesByPlatform = { obg: { Carol: { tags: [], responseSamples: [] } as OpponentEntry } }
    expect(globalOpponents([], entriesByPlatform)).toEqual([])
  })

  it('carries the stored avatar url, for an opponent with finished games or without', () => {
    const entriesByPlatform = {
      bga: { Alice: { tags: [], responseSamples: [], avatarUrl: 'https://example.com/alice.jpg' } as OpponentEntry },
      obg: { Dave: { tags: [], responseSamples: [], avatarUrl: 'https://example.com/dave.jpg' } as OpponentEntry },
    }
    const [bgaAlice] = globalOpponents(games, entriesByPlatform).filter(o => o.platform === 'bga')
    expect(bgaAlice.avatarUrl).toBe('https://example.com/alice.jpg')
    const [dave] = globalOpponents([], entriesByPlatform).filter(o => o.name === 'Dave')
    expect(dave.avatarUrl).toBe('https://example.com/dave.jpg')
  })

  it('keeps a stored entry with only an avatar — nothing else to show it by, but still something', () => {
    const entriesByPlatform = { bga: { Eve: { tags: [], responseSamples: [], avatarUrl: 'https://example.com/eve.jpg' } as OpponentEntry } }
    expect(globalOpponents([], entriesByPlatform)).toEqual([{
      platform: 'bga', name: 'Eve', games: 0, iWon: 0, theyWon: 0, lastPlayedAt: null,
      tags: [], responseSamples: [], medianResponseSeconds: null, avatarUrl: 'https://example.com/eve.jpg',
    }])
  })

  it('computes a Yucata/OBG profile link from the name alone, even with no stored data at all', () => {
    const [yucataAlice] = globalOpponents(games, {}).filter(o => o.platform === 'yucata')
    expect(yucataAlice.profileUrl).toBe('https://www.yucata.de/en/User/Alice')
  })

  it("uses BGA's stored profile url (needs a numeric id only a live game carries) rather than guessing one", () => {
    const entriesByPlatform = { bga: { Alice: { tags: [], responseSamples: [], profileUrl: 'https://boardgamearena.com/player?id=123' } as OpponentEntry } }
    const [bgaAlice] = globalOpponents(games, entriesByPlatform).filter(o => o.platform === 'bga')
    expect(bgaAlice.profileUrl).toBe('https://boardgamearena.com/player?id=123')
  })
})

describe('externalProfileUrl', () => {
  it('builds a Yucata profile link from the name', () => {
    expect(externalProfileUrl('yucata', 'Alice')).toBe('https://www.yucata.de/en/User/Alice')
  })

  it('builds an OBG profile link from the name', () => {
    expect(externalProfileUrl('obg', 'Alice')).toBe('https://www.onlineboardgamers.com/profile/Alice/')
  })

  it('falls back to the stored url for a platform with no name-only pattern (BGA)', () => {
    expect(externalProfileUrl('bga', 'Alice', 'https://boardgamearena.com/player?id=123')).toBe('https://boardgamearena.com/player?id=123')
    expect(externalProfileUrl('bga', 'Alice')).toBeUndefined()
  })

  it('is undefined for a platform investigated and found to have no working profile link', () => {
    expect(externalProfileUrl('rally', 'Alice')).toBeUndefined()
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
