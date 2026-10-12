import { Platform } from '../types'

export type BacklogList = 'play' | 'learn' | 'solo'

export const BACKLOG_LISTS: BacklogList[] = ['play', 'learn', 'solo']

export interface BacklogItem {
  id: string        // `${platform}:${normalized name}` — also the duplicate check
  platform: Platform
  gameName: string
  playUrl: string   // where a new game of it is started
  addedAt: string   // ISO
  lists?: BacklogList[] // the lists this item belongs to — a game can be in more than one at once
  list?: BacklogList    // legacy single-list field, from before an item could be in more than one list; read as a fallback by listsOf()
}

export function listsOf(item: BacklogItem): BacklogList[] {
  if (item.lists && item.lists.length > 0) return item.lists
  return [item.list ?? 'play']
}

export function backlogId(platform: Platform, gameName: string): string {
  return `${platform}:${gameName.toLowerCase().replace(/[^a-z0-9]/g, '')}`
}

// A new id is appended; an id already present has the new item's lists
// merged in (e.g. adding an already-"Play" game to Solo too), moving it to
// the end of the array so it lands last within that newly-added list's
// section as well — sections are just filtered views over this shared order.
export function addItem(list: BacklogItem[], item: BacklogItem): BacklogItem[] {
  const existing = list.find(i => i.id === item.id)
  if (!existing) return [...list, item]
  const existingLists = listsOf(existing)
  const merged = Array.from(new Set([...existingLists, ...listsOf(item)]))
  if (merged.length === existingLists.length) return list // already in every list being added
  return [...list.filter(i => i.id !== item.id), { ...existing, lists: merged, list: undefined }]
}

export function removeItem(list: BacklogItem[], id: string): BacklogItem[] {
  return list.filter(i => i.id !== id)
}

// Ids not in the list are dropped; items the ids don't mention (e.g. added on
// another device since this one loaded the list) stay, at the end
export function reorderItems(list: BacklogItem[], ids: string[]): BacklogItem[] {
  const byId = new Map(list.map(i => [i.id, i]))
  const ordered = ids.flatMap(id => byId.get(id) ?? [])
  const mentioned = new Set(ids)
  return [...ordered, ...list.filter(i => !mentioned.has(i.id))]
}

// Adds or removes membership in one list, leaving any other lists the item
// belongs to untouched. Never drops the last remaining list — use removeItem
// to take a game out of the backlog entirely. Gaining a new list moves the
// item to the end of the array (see addItem); losing one keeps its position.
export function toggleList(list: BacklogItem[], id: string, target: BacklogList): BacklogItem[] {
  const item = list.find(i => i.id === id)
  if (!item) return list
  const current = listsOf(item)
  if (current.includes(target)) {
    if (current.length <= 1) return list
    return list.map(i => i.id === id ? { ...i, lists: current.filter(l => l !== target), list: undefined } : i)
  }
  const lists = [...current, target]
  return [...list.filter(i => i.id !== id), { ...item, lists, list: undefined }]
}
