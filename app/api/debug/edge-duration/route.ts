export const runtime = 'edge'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Temporary: measures how long this edge function can actually run before
// Vercel kills it, to find the real ceiling maxDuration may or may not be
// raising. Protected by the app's own Basic Auth (middleware), not CRON_SECRET.
export async function GET(request: Request) {
  const ms = Number(new URL(request.url).searchParams.get('ms') ?? '20000')
  const start = Date.now()
  await new Promise(resolve => setTimeout(resolve, ms))
  return Response.json({ requestedMs: ms, actualMs: Date.now() - start })
}
