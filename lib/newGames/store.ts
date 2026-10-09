import { kv } from '@vercel/kv'
import { NewGameEvent, NewGamesSource, SourceSnapshot } from './diff'

const PREFIX = 'new-games:v1'
const EVENTS_KEY = `${PREFIX}:events`
const SEEN_KEY = `${PREFIX}:seen`
const MAX_EVENTS = 200

// One key per source keeps each value small (BGA's is the biggest, ~1500 games)
const snapshotKey = (source: NewGamesSource) => `${PREFIX}:snapshot:${source}`

export async function getSnapshot(source: NewGamesSource): Promise<SourceSnapshot | null> {
  return kv.get<SourceSnapshot>(snapshotKey(source))
}

export async function setSnapshot(source: NewGamesSource, snapshot: SourceSnapshot): Promise<void> {
  await kv.set(snapshotKey(source), snapshot)
}

// Newest first
export async function getEvents(): Promise<NewGameEvent[]> {
  return (await kv.get<NewGameEvent[]>(EVENTS_KEY)) ?? []
}

export async function addEvents(events: NewGameEvent[]): Promise<void> {
  if (events.length === 0) return
  const known = await getEvents()
  const ids = new Set(known.map(e => e.id))
  const fresh = events.filter(e => !ids.has(e.id))
  await kv.set(EVENTS_KEY, [...fresh, ...known].slice(0, MAX_EVENTS))
}

// When the dashboard's popup was last dismissed (ISO), shared by every device
export async function getSeenAt(): Promise<string | null> {
  return kv.get<string>(SEEN_KEY)
}

export async function setSeenAt(iso: string): Promise<void> {
  await kv.set(SEEN_KEY, iso)
}
