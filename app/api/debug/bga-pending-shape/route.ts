import { NextResponse } from 'next/server'
import { withBgaSession, fetchBgaTables } from '@/lib/connectors/bga'

// TEMPORARY debug route — remove once we've found the field BGA uses for a
// setup table's target player count. Dumps the full raw object for every
// not-yet-started ("asyncinit"-status) table, reusing the already-cached
// session so this doesn't risk a fresh login.
export async function GET() {
  const username = process.env.BGA_USERNAME
  const password = process.env.BGA_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'BGA_USERNAME/BGA_PASSWORD not configured' }, { status: 500 })
  }

  try {
    const tables = await withBgaSession(username, password, s => fetchBgaTables(s))
    const pending = (tables as any[]).filter(t => /init$/.test(t.status))
    return NextResponse.json({ pending })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
