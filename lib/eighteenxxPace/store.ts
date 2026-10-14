import { kv } from '@vercel/kv'

const SAMPLES_KEY = 'eighteenxxpace:v1:samples'

export interface EighteenxxSample {
  turn: number
  playerCount: number
}

// One entry per finished game, keyed by title (e.g. "1846", "18USA") — 18xx
// already reports `turn` on every game, active or finished, in the same
// response the dashboard already fetches, so there's no need for a BGA/Rally-
// style per-game tracker: just the aggregate finished samples per title.
export type EighteenxxSamples = Record<string, EighteenxxSample[]>

export async function getEighteenxxSamples(): Promise<EighteenxxSamples> {
  return (await kv.get<EighteenxxSamples>(SAMPLES_KEY)) ?? {}
}

export async function setEighteenxxSamples(samples: EighteenxxSamples): Promise<void> {
  await kv.set(SAMPLES_KEY, samples)
}
