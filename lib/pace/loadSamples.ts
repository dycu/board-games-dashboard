import { kv } from '@vercel/kv'
import { Platform } from '../types'

// How many games were running on each platform at a moment, recorded from
// dashboard refreshes. Only BGA has a full start/end history; for the other
// platforms these snapshots are the only record of how many games were going.
export interface LoadSample {
  t: number                                // Unix seconds
  counts: Partial<Record<Platform, number>> // platforms that errored are left out
}

const SAMPLES_KEY = 'pace:v1:load-samples'
const THROTTLE_KEY = 'pace:v1:load-sample-lock'
const SAMPLE_EVERY_SECONDS = 10 * 60
const MAX_SAMPLES = 20000 // ~4–5 months at one sample per 10 minutes

export async function recordLoadSample(counts: LoadSample['counts']): Promise<void> {
  if (Object.keys(counts).length === 0) return
  try {
    // NX lock = at most one sample per interval however often the dashboard refreshes
    const acquired = await kv.set(THROTTLE_KEY, 1, { nx: true, ex: SAMPLE_EVERY_SECONDS })
    if (!acquired) return
    const sample: LoadSample = { t: Math.floor(Date.now() / 1000), counts }
    await kv.rpush(SAMPLES_KEY, sample)
    await kv.ltrim(SAMPLES_KEY, -MAX_SAMPLES, -1)
  } catch {
    // best-effort: never let logging affect the dashboard
  }
}

export async function getLoadSamples(): Promise<LoadSample[]> {
  return (await kv.lrange<LoadSample>(SAMPLES_KEY, 0, -1)) ?? []
}
