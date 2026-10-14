import { getTables, putTables } from '@/lib/pace/store'
import { estimateProgress } from '@/lib/pace/progress'

// One-time cleanup: the first (buggy) version of turn-counting already wrote
// a half-advanced totalTurnState for every active table before the from=1
// backfill fix landed, so those tables can no longer tell they need a full
// re-read. This clears it so the next sync starts them over from packet 1.
export async function POST() {
  const tables = await getTables()
  const active = Object.values(tables).filter(t => t.end === null)
  await putTables(active.map(t => ({ ...t, totalTurnState: undefined })))
  return Response.json({ reset: active.length })
}

export async function GET() {
  const tables = await getTables()
  const all = Object.values(tables)
  const active = all.filter(t => t.end === null)
  const finishedWithTurns = all.filter(t => t.end !== null && (t.totalTurnState?.count ?? 0) > 0)
  const activeWithEstimate = active
    .map(t => ({ id: t.id, game: t.game, turnsSoFar: t.totalTurnState?.count ?? 0, progress: estimateProgress(tables, t.id) }))
  return Response.json({
    marker: 'backfill-fix-v2',
    totalTables: all.length,
    activeTables: active.length,
    finishedWithTurnData: finishedWithTurns.map(t => ({ id: t.id, game: t.game, turns: t.totalTurnState?.count })),
    activeTables_detail: activeWithEstimate,
  })
}
