import { gameTagsOf, allGameTags } from '../match'

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
