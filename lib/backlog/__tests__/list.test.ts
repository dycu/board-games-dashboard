import { addItem, removeItem, reorderItems, backlogId, BacklogItem } from '../list'

const item = (platform: BacklogItem['platform'], gameName: string): BacklogItem => ({
  id: backlogId(platform, gameName),
  platform,
  gameName,
  playUrl: 'https://example.com',
  addedAt: '2026-10-07T00:00:00.000Z',
})

describe('backlogId', () => {
  it('ignores case and punctuation in the name', () => {
    expect(backlogId('bga', 'Ark Nova')).toBe(backlogId('bga', 'ark-nova!'))
  })
  it('differs per platform', () => {
    expect(backlogId('bga', 'Ark Nova')).not.toBe(backlogId('yucata', 'Ark Nova'))
  })
})

describe('addItem', () => {
  it('appends to the end', () => {
    const list = addItem([item('bga', 'A')], item('bga', 'B'))
    expect(list.map(i => i.gameName)).toEqual(['A', 'B'])
  })
  it('ignores a duplicate', () => {
    const list = [item('bga', 'Ark Nova')]
    expect(addItem(list, item('bga', 'ark nova'))).toBe(list)
  })
})

describe('removeItem', () => {
  it('removes by id', () => {
    const list = [item('bga', 'A'), item('bga', 'B')]
    expect(removeItem(list, list[0].id).map(i => i.gameName)).toEqual(['B'])
  })
})

describe('reorderItems', () => {
  const list = [item('bga', 'A'), item('bga', 'B'), item('bga', 'C')]
  it('follows the given order', () => {
    const ids = [list[2].id, list[0].id, list[1].id]
    expect(reorderItems(list, ids).map(i => i.gameName)).toEqual(['C', 'A', 'B'])
  })
  it('drops unknown ids and keeps unmentioned items at the end', () => {
    // e.g. another device added C after this one loaded the list
    const ids = ['bga:zzz', list[1].id, list[0].id]
    expect(reorderItems(list, ids).map(i => i.gameName)).toEqual(['B', 'A', 'C'])
  })
})
