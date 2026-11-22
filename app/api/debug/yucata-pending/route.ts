// Temporary debug route — reuses the already-cached Yucata session to see
// the real shape of /api/me/invitations/waiting, since fetchPendingYucata
// was written from the frontend bundle alone with "no live sample seen"
// and its failures are silently swallowed (.catch(() => [])). Delete once
// answered.
import { NextResponse } from 'next/server'
import { withYucataSession } from '@/lib/connectors/yucata'

const BASE = 'https://www.yucata.de'

export async function GET() {
  const username = process.env.YUCATA_USERNAME
  const password = process.env.YUCATA_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'YUCATA_USERNAME/PASSWORD not set' }, { status: 500 })
  try {
    return await withYucataSession(username, password, async jar => {
      const cookieHeader = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
      const headers = {
        Accept: 'application/json',
        Cookie: cookieHeader,
        'User-Agent': 'Mozilla/5.0',
        Referer: `${BASE}/en/Overview`,
      }
      const paths = [
        '/api/me/invitations/waiting',
        '/api/me/invitations/received',
        '/api/me/invitations/sent',
        '/api/me/games/current',
        '/api/me/games',
        '/api/me/overview',
      ]
      const results: Record<string, unknown> = {}
      for (const path of paths) {
        try {
          const res = await fetch(`${BASE}${path}`, { headers })
          const text = await res.text()
          results[path] = { status: res.status, bodyStart: text.slice(0, 1500) }
        } catch (e) {
          results[path] = { error: e instanceof Error ? e.message : String(e) }
        }
      }
      return NextResponse.json(results)
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
