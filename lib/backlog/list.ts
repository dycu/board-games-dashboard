import { Platform } from '../types'

export type BacklogList = 'play' | 'learn'

export const BACKLOG_LISTS: BacklogList[] = ['play', 'learn']

export interface BacklogItem {
  id: string        // `${platform}:${normalized name}` — also the duplicate check
  platform: Platform
  gameName: string
  playUrl: string   // where a new game of it is started
  addedAt: string   // ISO
  list?: BacklogList // missing on items saved before there were two lists = 'play'
}

export function listOf(item: BacklogItem): BacklogList {
  return item.list ?? 'play'
}

export function backlogId(platform: Platform, gameName: string): string {
  return `${platform}:${gameName.toLowerCase().replace(/[^a-z0-9]/g, '')}`
}

export function addItem(list: BacklogItem[], item: BacklogItem): BacklogItem[] {
  return list.some(i => i.id === item.id) ? list : [...list, item]
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

// Moves to the end of the other list
export function moveToList(list: BacklogItem[], id: string, target: BacklogList): BacklogItem[] {
  const item = list.find(i => i.id === id)
  if (!item) return list
  return [...list.filter(i => i.id !== id), { ...item, list: target }]
}
