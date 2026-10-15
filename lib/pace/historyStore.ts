import { kv } from '@vercel/kv'

const KEY = 'pace:v1:bga:history-rows'

// One raw getGames.html row per finished table (table_id, game_name, start,
// end, players, ranks, scores, elo_after, ...) — enough for bgaFinishedRow()
// to rebuild a full FinishedGame later without refetching it from BGA.
// Populated as a side effect of syncBga's existing finished-table page walk
// (lib/pace/sync.ts), so it reaches the whole account's history over time
// with no extra requests to BGA beyond what Pace already makes.
export type RawBgaRow = Record<string, unknown>

// KV is best-effort here, same as the rest of Pace: a KV hiccup (or being
// unconfigured, e.g. in tests) must never break fetching games — it just
// means this run's rows aren't persisted, or the stored history reads back
// empty and callers fall back to a live fetch.
export async function putHistoryRows(rows: Record<string, RawBgaRow>): Promise<void> {
  if (Object.keys(rows).length === 0) return
  try { await kv.hset(KEY, rows) } catch { /* best-effort */ }
}

export async function getAllHistoryRows(): Promise<RawBgaRow[]> {
  try {
    const all = await kv.hgetall<Record<string, RawBgaRow>>(KEY)
    return all ? Object.values(all) : []
  } catch {
    return []
  }
}
