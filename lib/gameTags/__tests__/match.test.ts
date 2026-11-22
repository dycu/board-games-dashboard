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

  // A tag saved before GameTagEntry gained its own gameName field (every
  // tag set before this view existed) has no gameName at all — falling
  // back to the hash key here is what keeps this from crashing the whole
  // Backlog page the moment such a tag is selected, as it did in production.
  it('falls back to the hash key for an entry saved before gameName existed, instead of crashing', () => {
    const byPlatform = { bga: { 'gaia project': { tags: ['live'] } } }
    expect(titlesWithTag(byPlatform, 'live')).toEqual([{ platform: 'bga', gameName: 'gaia project' }])
  })
})
