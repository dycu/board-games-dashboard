import { kv } from '@vercel/kv'
import { NewGameEvent } from '@/lib/newGames/diff'

// TEMPORARY — one-off cleanup of the last yucata-blog events left over from
// before that source was removed. Remove this route once run.
const EVENTS_KEY = 'new-games:v1:events'

export async function POST() {
  const events = (await kv.get<NewGameEvent[]>(EVENTS_KEY)) ?? []
  const kept = events.filter(e => (e.source as string) !== 'yucata-blog')
  await kv.set(EVENTS_KEY, kept)
  return Response.json({ before: events.length, after: kept.length, removed: events.length - kept.length })
}
