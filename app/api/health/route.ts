import { runHealthCheck, readHealthState, fetchGamesStream } from '@/lib/health/run'
import { sendDigest, sendDeadlineWarnings, sendWeekly } from '@/lib/notify/send'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Behind Basic Auth. GET shows the last check's state; ?run=1 runs a check
// now (same as the daily cron) and &testEmail=1 sends an email even if nothing
// changed; &digest=1 also sends the morning digest, &deadlines=1 the
// due-soon warnings and &weekly=1 Sunday's weekly summary.
export async function GET(request: Request) {
  const url = new URL(request.url)
  if (!url.searchParams.has('run')) return Response.json(await readHealthState())
  const { games, ...report } = await runHealthCheck(url.origin, request.headers.get('authorization') ?? '', {
    forceEmail: url.searchParams.has('testEmail'),
  })
  const ok = report.results.length > 0
  const digest = ok && url.searchParams.has('digest') ? await sendDigest(games) : null
  const deadlines = ok && url.searchParams.has('deadlines') ? await sendDeadlineWarnings(games) : null
  let weekly = null
  if (ok && url.searchParams.has('weekly')) {
    const auth = request.headers.get('authorization') ?? ''
    const { games: finished } = await fetchGamesStream(url.origin, auth, '/api/finished-games')
    weekly = await sendWeekly(finished, games)
  }
  return Response.json({ ...report, digest, deadlines, weekly })
}
