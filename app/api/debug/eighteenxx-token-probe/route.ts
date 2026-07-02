import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BASE = 'https://18xx.games'

// Test how 18xx.games accepts an auth_token found in poll requests.
// Usage: GET /api/debug/eighteenxx-token-probe?token=<auth_token_value>
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Pass ?token=<auth_token_value>' }, { status: 400 })

  const log: string[] = []

  async function probe(label: string, url: string, init: RequestInit) {
    try {
      const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init.headers as object) } })
      const text = await res.text()
      let json: unknown
      try { json = JSON.parse(text) } catch {}
      log.push(`[${label}] HTTP ${res.status} — ${text.slice(0, 200)}`)
      return { ok: res.ok, status: res.status, json }
    } catch (e: any) {
      log.push(`[${label}] THROW: ${e.message}`)
      return { ok: false, status: 0, json: null }
    }
  }

  // 1. auth_token as query param on /api/user
  const r1 = await probe(
    'query-param /api/user',
    `${BASE}/api/user?auth_token=${token}`,
    {},
  )

  // 2. auth_token as cookie on /api/user
  const r2 = await probe(
    'cookie auth_token=/api/user',
    `${BASE}/api/user`,
    { headers: { Cookie: `auth_token=${token}` } },
  )

  // 3. raw token as Cookie header (in case the full value is already a cookie string)
  const r3 = await probe(
    'raw cookie /api/user',
    `${BASE}/api/user`,
    { headers: { Cookie: token } },
  )

  // 4. Bearer token on /api/user
  const r4 = await probe(
    'bearer /api/user',
    `${BASE}/api/user`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  // 5. If query-param worked, also test /api/game/user with it
  let gamesResult: unknown = null
  if (r1.ok) {
    const r5 = await probe(
      'query-param /api/game/user',
      `${BASE}/api/game/user?auth_token=${token}`,
      {},
    )
    gamesResult = r5
  }

  const winner = r1.ok ? 'query-param' : r2.ok ? 'cookie auth_token=' : r3.ok ? 'raw cookie' : r4.ok ? 'bearer' : 'none'

  return NextResponse.json({ winner, log, gamesResult })
}
