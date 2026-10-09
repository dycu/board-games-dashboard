import { Platform } from '../types'

// One thing a source lists: a game in a site's catalog, or a blog post
export interface WatchedItem {
  key: string     // stable id within its source (URL, slug or post key)
  name: string
  url: string
  status?: string // release stage, where the site has one
}

export type NewGamesSource = 'bga' | 'eighteenxx' | 'rally' | 'yucata' | 'yucata-blog'

export const SOURCE_PLATFORM: Record<NewGamesSource, Platform> = {
  bga: 'bga',
  eighteenxx: 'eighteenxx',
  rally: 'rally',
  yucata: 'yucata',
  'yucata-blog': 'yucata',
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
