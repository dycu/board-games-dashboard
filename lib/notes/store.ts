import { kv } from '@vercel/kv'

// One short note per game, keyed by the game's id (e.g. "bga:766195607")
const NOTES_KEY = 'notes:v1'
export const NOTE_MAX_LENGTH = 300

export async function getNotes(): Promise<Record<string, string>> {
  return (await kv.hgetall<Record<string, string>>(NOTES_KEY)) ?? {}
}

// An empty text deletes the note
export async function setNote(id: string, text: string): Promise<void> {
  const clean = text.trim().slice(0, NOTE_MAX_LENGTH)
  if (clean) await kv.hset(NOTES_KEY, { [id]: clean })
  else await kv.hdel(NOTES_KEY, id)
}
