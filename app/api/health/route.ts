import { runHealthCheck, readHealthState } from '@/lib/health/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Behind Basic Auth. GET shows the last check's state; ?run=1 runs a check
// now (same as the daily cron) and &testEmail=1 sends an email even if nothing changed.
export async function GET(request: Request) {
  const url = new URL(request.url)
  if (!url.searchParams.has('run')) return Response.json(await readHealthState())
  const report = await runHealthCheck(url.origin, request.headers.get('authorization') ?? '', {
    forceEmail: url.searchParams.has('testEmail'),
  })
  return Response.json(report)
}
