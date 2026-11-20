import { NextResponse } from 'next/server'
import { Platform } from '@/lib/types'
import { getWatch, deleteWatch } from '@/lib/perPlayerMoves/store'

export const dynamic = 'force-dynamic'

// One-time migration helper, not a permanent part of the app: wipes every
// platform's pptrack-watch state so the next /api/games fetch treats every
// currently-live game as "first sight" again, which is what actually
// credits lib/moveCounts/track.ts's already-known moveCountToday via
// lib/perPlayerMoves/track.ts's backfill. Needed because an earlier manual
// fetch (run to seed the tracker right after shipping it, before that
// backfill existed) already burned "first sight" for every live game with
// no credit — this route, and its removal right after, are their own
// commits; it is not meant to stick around.
export async function POST() {
  const platforms: Platform[] = ['bga', 'eighteenxx', 'obg', 'yucata', 'choochoo', 'hansa', 'rally', 'oldkingscrown', 'boardgamers', 'boardtogether']
  const cleared: Record<string, number> = {}
  for (const platform of platforms) {
    const watch = await getWatch(platform)
    const ids = Object.keys(watch)
    if (ids.length > 0) await deleteWatch(platform, ids)
    cleared[platform] = ids.length
  }
  return NextResponse.json({ cleared })
}
