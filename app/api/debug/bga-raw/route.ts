import { withBgaSession, fetchBgaTables } from '@/lib/connectors/bga'

// Temporary: inspect the raw BGA tableinfos response to check for an avatar/
// image field before building the player-avatars feature. Delete after use.
export async function GET() {
  const username = process.env.BGA_USERNAME ?? ''
  const password = process.env.BGA_PASSWORD ?? ''
  const tables = await withBgaSession(username, password, session => fetchBgaTables(session))
  return Response.json({ tables: tables.slice(0, 2) })
}
