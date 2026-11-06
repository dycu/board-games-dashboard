import { kv } from '@vercel/kv'

// One short label per game, keyed by the game's id (e.g. "bga:766195607") —
// distinguishes multiple simultaneous games of the same GMed title from
// each other (e.g. "Group A", "with Janek"). Separate from the per-game
// note (lib/notes/store.ts), which is used for round-to-round planning and
// gets cleared/replaced often — a table label needs to survive that.
const TABLE_LABELS_KEY = 'table-labels:v1'
export const TABLE_LABEL_MAX_LENGTH = 60

export async function getTableLabels(): Promise<Record<string, string>> {
  return (await kv.hgetall<Record<string, string>>(TABLE_LABELS_KEY)) ?? {}
}

// An empty text deletes the label
export async function setTableLabel(id: string, text: string): Promise<void> {
  const clean = text.trim().slice(0, TABLE_LABEL_MAX_LENGTH)
  if (clean) await kv.hset(TABLE_LABELS_KEY, { [id]: clean })
  else await kv.hdel(TABLE_LABELS_KEY, id)
}
