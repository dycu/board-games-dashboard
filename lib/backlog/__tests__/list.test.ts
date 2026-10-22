import { addItem, removeItem, reorderItems, backlogId, BacklogItem, listsOf, toggleList, BACKLOG_LISTS } from '../list'

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
  it('ignores a duplicate already in every list being added', () => {
    const list = [{ ...item('bga', 'Ark Nova'), lists: ['play' as const] }]
    expect(addItem(list, { ...item('bga', 'ark nova'), lists: ['play'] })).toBe(list)
  })
  it('merges in a new list for an item already in the backlog, moving it to the end', () => {
    const list = [{ ...item('bga', 'A'), lists: ['play' as const] }, item('bga', 'B')]
    const result = addItem(list, { ...item('bga', 'a'), lists: ['solo'] })
    expect(result.map(i => i.gameName)).toEqual(['B', 'A'])
    expect(listsOf(result.find(i => i.gameName === 'A')!)).toEqual(['play', 'solo'])
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

describe('lists', () => {
  it('treats items saved before lists existed as "play"', () => {
    const old = item('bga', 'A') // has no list/lists field
    expect(listsOf(old)).toEqual(['play'])
  })

  it('reads the legacy singular "list" field as a fallback', () => {
    expect(listsOf({ ...item('bga', 'B'), list: 'learn' })).toEqual(['learn'])
  })

  it('includes a third "solo" list alongside play and learn', () => {
    expect(BACKLOG_LISTS).toEqual(['play', 'learn', 'solo', 'favorite'])
  })

  it('reordering one list keeps the other list in its order', () => {
    const list = [
      { ...item('bga', 'A'), lists: ['play' as const] },
      { ...item('bga', 'L1'), lists: ['learn' as const] },
      { ...item('bga', 'B'), lists: ['play' as const] },
      { ...item('bga', 'L2'), lists: ['learn' as const] },
    ]
    const reordered = reorderItems(list, [list[2].id, list[0].id])
    expect(reordered.filter(i => listsOf(i).includes('play')).map(i => i.gameName)).toEqual(['B', 'A'])
    expect(reordered.filter(i => listsOf(i).includes('learn')).map(i => i.gameName)).toEqual(['L1', 'L2'])
  })
})

describe('toggleList', () => {
  it('adds a second list membership without removing the first — a game can be in Play and Solo at once', () => {
    const list = [{ ...item('bga', 'A'), lists: ['play' as const] }]
    const toggled = toggleList(list, list[0].id, 'solo')
    expect(listsOf(toggled[0])).toEqual(['play', 'solo'])
  })

  it('moves the item to the end when gaining a list, so it lands last in that list too', () => {
    const list = [
      { ...item('bga', 'A'), lists: ['play' as const] },
      { ...item('bga', 'B'), lists: ['solo' as const] },
    ]
    const toggled = toggleList(list, list[0].id, 'solo')
    expect(toggled.filter(i => listsOf(i).includes('solo')).map(i => i.gameName)).toEqual(['B', 'A'])
  })

  it('removes a list membership while leaving others untouched', () => {
    const list = [{ ...item('bga', 'A'), lists: ['play' as const, 'solo' as const] }]
    const toggled = toggleList(list, list[0].id, 'solo')
    expect(listsOf(toggled[0])).toEqual(['play'])
  })

  it('removes the item entirely when toggling off its last remaining list', () => {
    const list = [{ ...item('bga', 'A'), lists: ['solo' as const] }, item('bga', 'B')]
    const toggled = toggleList(list, list[0].id, 'solo')
    expect(toggled.map(i => i.gameName)).toEqual(['B'])
  })

  it('is a no-op for an unknown id', () => {
    const list = [item('bga', 'A')]
    expect(toggleList(list, 'bga:nope', 'solo')).toBe(list)
  })
})
