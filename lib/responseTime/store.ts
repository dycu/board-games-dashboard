import { kv } from '@vercel/kv'
import { Platform } from '../types'

// How long it took *me* to respond once a game became my turn, in seconds —
// a rolling window per platform (not per opponent: this is a question about
// my own habits, not about who I'm facing). Mirrors lib/opponents/store.ts's
// responseSamples, just without a name to key by.
const MAX_SAMPLES = 30

function key(platform: Platform): string {
  return `myresponsetime:v1:${platform}`
}

export async function getMySamples(platform: Platform): Promise<number[]> {
  return (await kv.get<number[]>(key(platform))) ?? []
}

export async function addMySample(platform: Platform, seconds: number): Promise<void> {
  const samples = await getMySamples(platform)
  await kv.set(key(platform), [...samples, seconds].slice(-MAX_SAMPLES))
}
