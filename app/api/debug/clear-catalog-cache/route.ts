import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

// Temporary: the Rally catalog cache (24h TTL) was built before "Traces of
// War" was added to rally-the-troops.com/games/library, so search couldn't
// find it until the cache turned over on its own. Clears it now instead of
// waiting. Protected by the app's own Basic Auth (middleware), not CRON_SECRET.
export async function GET(request: Request) {
  const platform = new URL(request.url).searchParams.get('platform') ?? 'rally'
  await kv.del(`game-catalog:v5:${platform}`)
  return Response.json({ cleared: platform })
}
