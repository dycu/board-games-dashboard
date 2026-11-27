import { kv } from '@vercel/kv'

// Choochoo's game list has no date at all, so every finished game used to
// come out as finished at the Unix epoch (1970) and never fell into any
// History period. A game's own detail (GET /api/games/{id}) does carry
// `turnStartTime` — for an ended game, when its last turn started — which
// is the closest thing to a finish time the API has. An ended game never
// changes, so each one is looked up once and remembered in KV.
const KEY = 'choochoo-ended-at:v1'
const CONCURRENCY = 5

export type FetchDetail = (id: number) => Promise<{ turnStartTime?: unknown } | null | undefined>

export async function resolveEndedTimes(ids: number[], fetchDetail: FetchDetail): Promise<Map<number, Date>> {
  const out = new Map<number, Date>()

  let cached: Record<string, string> = {}
  try { cached = (await kv.hgetall<Record<string, string>>(KEY)) ?? {} } catch { /* KV down: look everything up */ }

  const missing: number[] = []
  for (const id of ids) {
    const d = cached[String(id)] ? new Date(cached[String(id)]) : null
    if (d && !isNaN(d.getTime())) out.set(id, d)
    else missing.push(id)
  }

  const found: Record<string, string> = {}
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    await Promise.all(missing.slice(i, i + CONCURRENCY).map(async id => {
      try {
        const detail = await fetchDetail(id)
        const raw = detail?.turnStartTime
        // Choochoo sends Date#toString() ("Sun Oct 25 2026 15:40:07 GMT+0000
        // (Coordinated Universal Time)"), which Date parses; ISO works too
        const d = typeof raw === 'string' || typeof raw === 'number' ? new Date(raw) : null
        if (d && !isNaN(d.getTime()) && d.getTime() > 0) {
          out.set(id, d)
          found[String(id)] = d.toISOString()
        }
      } catch { /* leave this one out; it's retried next time */ }
    }))
  }

  if (Object.keys(found).length) {
    try { await kv.hset(KEY, found) } catch { /* fine, looked up again next time */ }
  }
  return out
}
