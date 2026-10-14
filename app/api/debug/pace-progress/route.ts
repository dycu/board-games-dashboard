import { getTables } from '@/lib/pace/store'
import { estimateProgress } from '@/lib/pace/progress'

export async function GET() {
  const tables = await getTables()
  const all = Object.values(tables)
  const active = all.filter(t => t.end === null)
  const finishedWithTurns = all.filter(t => t.end !== null && (t.totalTurnState?.count ?? 0) > 0)
  const activeWithEstimate = active
    .map(t => ({ id: t.id, game: t.game, turnsSoFar: t.totalTurnState?.count ?? 0, progress: estimateProgress(tables, t.id) }))
  return Response.json({
    version: process.env.npm_package_version ?? 'unknown',
    totalTables: all.length,
    activeTables: active.length,
    finishedWithTurnData: finishedWithTurns.map(t => ({ id: t.id, game: t.game, turns: t.totalTurnState?.count })),
    activeTables_detail: activeWithEstimate,
  })
}
