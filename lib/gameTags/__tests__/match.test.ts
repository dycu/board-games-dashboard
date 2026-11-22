import { gameTagsOf, allGameTags, titlesWithTag } from '../match'

describe('gameTagsOf', () => {
  it('finds tags by platform and a case-insensitive title match', () => {
    const byPlatform = { bga: { 'gaia project': { tags: ['heavy', 'live'], gameName: 'Gaia Project' } } }
    expect(gameTagsOf(byPlatform, 'bga', 'Gaia Project')).toEqual(['heavy', 'live'])
  })

  it('returns an empty list for an untagged title', () => {
    const byPlatform = { bga: { 'gaia project': { tags: ['heavy'], gameName: 'Gaia Project' } } }
    expect(gameTagsOf(byPlatform, 'bga', 'Brass: Birmingham')).toEqual([])
  })

  it('returns an empty list before anything has loaded', () => {
    expect(gameTagsOf(null, 'bga', 'Gaia Project')).toEqual([])
  })
})

describe('allGameTags', () => {
  it('collects every distinct tag across every platform, sorted', () => {
    const byPlatform = {
      bga: { 'gaia project': { tags: ['heavy', 'live'], gameName: 'Gaia Project' } },
      rally: { nevsky: { tags: ['live'], gameName: 'Nevsky' } },
    }
    expect(allGameTags(byPlatform)).toEqual(['heavy', 'live'])
  })

  it('returns an empty list before anything has loaded', () => {
    expect(allGameTags(null)).toEqual([])
  })
})

describe('titlesWithTag', () => {
  it('finds every (platform, title) carrying the tag, across platforms, sorted by name', () => {
    const byPlatform = {
      bga: { 'gaia project': { tags: ['heavy', 'live'], gameName: 'Gaia Project' } },
      rally: { nevsky: { tags: ['live'], gameName: 'Nevsky' } },
    }
    expect(titlesWithTag(byPlatform, 'live')).toEqual([
      { platform: 'bga', gameName: 'Gaia Project' },
      { platform: 'rally', gameName: 'Nevsky' },
    ])
  })

  it('is how a title shows up the moment it is tagged, even with no active game, finished game or backlog entry', () => {
    const byPlatform = { bga: { 'brand new game': { tags: ['live'], gameName: 'Brand New Game' } } }
    expect(titlesWithTag(byPlatform, 'live')).toEqual([{ platform: 'bga', gameName: 'Brand New Game' }])
  })

  it('excludes a title not carrying the tag', () => {
    const byPlatform = { bga: { 'gaia project': { tags: ['heavy'], gameName: 'Gaia Project' } } }
    expect(titlesWithTag(byPlatform, 'live')).toEqual([])
  })

  it('returns an empty list before anything has loaded', () => {
    expect(titlesWithTag(null, 'live')).toEqual([])
  })
})
