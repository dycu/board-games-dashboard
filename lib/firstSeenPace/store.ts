import { kv } from '@vercel/kv'
import { Platform } from '../types'

// For platforms whose own API/pages never expose when a game started (or a
// turn/action count to compare against), there's no way to read a "how far
// along is this" signal from the site itself — the only option left is to
// start timing it ourselves. firstSeenAt is our own clock, not the site's:
// a game already well underway the first time we see it will show inflated
// progress until enough of our own full-duration samples (of games we did
// watch end-to-end) exist to anchor it properly.
export interface FirstSeenEntry {
  typeId: string         // Game['gameType'] ?? Game['gameName'] — whatever this platform's connector reports
  firstSeenAt: number    // Unix seconds, our own first observation
}

const MAX_SAMPLES_PER_TYPE = 30

function trackedKey(platform: Platform): string {
  return `firstseenpace:v1:${platform}:tracked`
}
function samplesKey(platform: Platform): string {
  return `firstseenpace:v1:${platform}:samples`
}

export async function getTracked(platform: Platform): Promise<Record<string, FirstSeenEntry>> {
  return (await kv.hgetall<Record<string, FirstSeenEntry>>(trackedKey(platform))) ?? {}
}

export async function putTracked(platform: Platform, entries: Record<string, FirstSeenEntry>): Promise<void> {
  if (Object.keys(entries).length === 0) return
  await kv.hset(trackedKey(platform), entries)
}

export async function deleteTracked(platform: Platform, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await kv.hdel(trackedKey(platform), ...ids)
}

export async function getSamples(platform: Platform): Promise<Record<string, number[]>> {
  return (await kv.get<Record<string, number[]>>(samplesKey(platform))) ?? {}
}

// Durations in seconds, oldest dropped once a type has more than the cap —
// a type's typical length can drift (e.g. a popular variant gets added), so
// a rolling window tracks that better than an all-time average would.
export async function addSample(platform: Platform, typeId: string, durationSeconds: number): Promise<void> {
  const samples = await getSamples(platform)
  const next = [...(samples[typeId] ?? []), durationSeconds].slice(-MAX_SAMPLES_PER_TYPE)
  await kv.set(samplesKey(platform), { ...samples, [typeId]: next })
}
