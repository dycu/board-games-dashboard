import { kv } from '@vercel/kv'
import { Platform } from '../types'

// A user-defined goal — "play" or "win" N games of one title, anywhere
// (platform: null) or on one specific site. All of them live in a single
// small list rather than a hash: there's only ever a handful, and the page
// always needs the whole list at once (to compute progress against the
// finished-games history) so there's nothing a hash's per-field access
// would save here.
export interface Achievement {
  id: string
  platform: Platform | null // null = count across every platform
  gameType: string          // matched against (gameType || gameName), case-insensitive
  metric: 'played' | 'won'
  target: number
  createdAt: string          // ISO
  achievedAt?: string        // ISO; set once progress reaches target
}

const KEY = 'achievements:v1'

export async function getAchievements(): Promise<Achievement[]> {
  return (await kv.get<Achievement[]>(KEY)) ?? []
}

export async function putAchievements(list: Achievement[]): Promise<void> {
  await kv.set(KEY, list)
}
