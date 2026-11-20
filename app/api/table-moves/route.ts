import { NextRequest, NextResponse } from 'next/server'
import { PLATFORM_LABELS, Platform } from '@/lib/types'
import { getGameDays } from '@/lib/perPlayerMoves/store'

export const dynamic = 'force-dynamic'

// ?id=<game.id> (e.g. "bga:12345") — one table's own per-day, per-player
// move history, for the popup triggered from its card's dots. Not scoped
// to the dashboard's live games list: a table that already finished can
// still be looked up right up until its tracking state is cleaned up (see
// lib/perPlayerMoves/track.ts's vanished-game handling).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const platform = id.split(':')[0] as Platform
  if (!(platform in PLATFORM_LABELS) || id === platform) {
    return NextResponse.json({ error: 'id must be a full game id, e.g. "bga:12345"' }, { status: 400 })
  }
  try {
    return NextResponse.json({ days: await getGameDays(platform, id) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
