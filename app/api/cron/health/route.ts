import { runHealthCheck } from '@/lib/health/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Daily Vercel Cron: checks every platform and emails when one breaks or
// recovers. proxy.ts lets /api/cron/* through without Basic Auth, so this
// checks CRON_SECRET itself and sends Basic Auth on to /api/games.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const basic = Buffer.from(`${process.env.AUTH_USERNAME ?? ''}:${process.env.AUTH_PASSWORD ?? ''}`).toString('base64')
  const report = await runHealthCheck(new URL(request.url).origin, `Basic ${basic}`)
  return Response.json(report)
}
