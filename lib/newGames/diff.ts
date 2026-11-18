import { Platform } from '../types'

// One thing a source lists: a game in a site's catalog, or a blog post
export interface WatchedItem {
  key: string     // stable id within its source (URL, slug or post key)
  name: string
  url: string
  status?: string // release stage, where the site has one
}

export type NewGamesSource = 'bga' | 'eighteenxx' | 'rally' | 'yucata' | 'yucata-blog' | 'choochoo' | 'boardgamers' | 'boardtogether'

export const SOURCE_PLATFORM: Record<NewGamesSource, Platform> = {
  bga: 'bga',
  eighteenxx: 'eighteenxx',
  rally: 'rally',
  yucata: 'yucata',
  'yucata-blog': 'yucata',
  choochoo: 'choochoo',
  boardgamers: 'boardgamers',
  boardtogether: 'boardtogether',
}

export interface NewGameEvent {
  id: string
  at: string      // ISO, when the check found it
  source: NewGamesSource
  platform: Platform
  kind: 'new' | 'status' | 'post'
  name: string
  url: string
  status?: string
  from?: string   // previous status, for kind 'status'
}

// Everything a source has ever listed, by key. Items that disappear are kept,
// so a game dropping out of a list for a while doesn't come back as "new".
export type SourceSnapshot = Record<string, { name: string; status?: string }>

// Later stages rank higher; only a move up is news (alpha -> beta -> public)
const STAGE_RANK: Record<string, number> = { prealpha: 0, alpha: 1, beta: 2, public: 3, production: 3 }

function stageRank(status?: string): number | undefined {
  return status === undefined ? undefined : STAGE_RANK[status]
}

export function diffSource(
  source: NewGamesSource,
  previous: SourceSnapshot | null,
  items: WatchedItem[],
  at: string,
): { snapshot: SourceSnapshot; events: NewGameEvent[] } {
  const snapshot: SourceSnapshot = { ...(previous ?? {}) }
  const events: NewGameEvent[] = []
  const platform = SOURCE_PLATFORM[source]
  const kind = source === 'yucata-blog' ? 'post' : 'new'

  for (const item of items) {
    const before = previous?.[item.key]
    snapshot[item.key] = { name: item.name, ...(item.status !== undefined && { status: item.status }) }
    // The first check of a source only records what's there
    if (!previous) continue
    if (!before) {
      events.push({ id: `${source}:${item.key}:${kind}`, at, source, platform, kind, name: item.name, url: item.url, ...(item.status !== undefined && { status: item.status }) })
      continue
    }
    const was = stageRank(before.status)
    const now = stageRank(item.status)
    if (was !== undefined && now !== undefined && now > was) {
      events.push({ id: `${source}:${item.key}:status:${item.status}`, at, source, platform, kind: 'status', name: item.name, url: item.url, status: item.status, from: before.status })
    }
  }
  return { snapshot, events }
}

export function eventLabel(e: NewGameEvent): string {
  if (e.kind === 'post') return 'blog post'
  if (e.kind === 'status') return `${e.from} → ${e.status}`
  return e.status && e.status !== 'public' && e.status !== 'production' ? `new (${e.status})` : 'new'
}

export interface EventDayGroup {
  dateKey: string // this viewer's local calendar date (toDateString()) — stable, usable as a React key
  label: string   // "Today" / "Yesterday" / "Mon, Jan 5"
  events: NewGameEvent[]
}

// Buckets events (assumed newest-first, as the store already returns them)
// by the viewer's local calendar day, preserving that order — grouping
// never needs to re-sort.
export function groupEventsByDay(events: NewGameEvent[], now = new Date()): EventDayGroup[] {
  const todayKey = now.toDateString()
  const yesterdayKey = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString()

  const order: string[] = []
  const byDay = new Map<string, { sample: Date; events: NewGameEvent[] }>()
  for (const e of events) {
    const date = new Date(e.at)
    const dateKey = date.toDateString()
    if (!byDay.has(dateKey)) { byDay.set(dateKey, { sample: date, events: [] }); order.push(dateKey) }
    byDay.get(dateKey)!.events.push(e)
  }

  return order.map(dateKey => {
    const { sample, events: dayEvents } = byDay.get(dateKey)!
    return {
      dateKey,
      label: dateKey === todayKey ? 'Today'
        : dateKey === yesterdayKey ? 'Yesterday'
        : sample.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      events: dayEvents,
    }
  })
}
