import { NextResponse } from 'next/server'
import { getTables } from '@/lib/pace/store'
import { estimateProgress } from '@/lib/pace/progress'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tables = await getTables()
  const interesting = Object.values(tables).filter(t =>
    t.end === null && /popcorn|iberiangauge/i.test(t.game)
  )
  const now = Date.now() / 1000
  const summary = interesting.map(t => ({
    id: t.id,
    game: t.game,
    start: t.start,
    elapsedDays: (now - t.start) / 86400,
    turnsSoFar: t.totalTurnState?.count,
    playerCount: t.playerCount,
    progress: estimateProgress(tables, t.id),
  }))
  return NextResponse.json(summary)
}
