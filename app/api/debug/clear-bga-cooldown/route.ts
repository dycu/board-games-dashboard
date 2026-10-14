import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

// Temporary: BGA's login endpoint returned a 504 at some point, tripping the
// 15-minute login cooldown in lib/connectors/bga.ts. BGA is back up now
// (verified directly), so this clears the stale cooldown instead of waiting
// it out. Protected by the app's own Basic Auth (middleware), not CRON_SECRET.
export async function GET() {
  await kv.del('bga-login-failed:v1')
  return Response.json({ cleared: true })
}
