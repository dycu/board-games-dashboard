import { kv } from '@vercel/kv'
import { UserPrefs, DEFAULT_PREFS } from './types'

const KEY = 'user-prefs'

export async function getPrefs(): Promise<UserPrefs> {
  try {
    const stored = await kv.get<UserPrefs>(KEY)
    return stored ?? DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

export async function savePrefs(partial: Partial<UserPrefs>): Promise<void> {
  const current = await getPrefs()
  await kv.set(KEY, { ...current, ...partial })
}
