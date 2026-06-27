import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const results: any[] = []

  // ── RALLY THE TROOPS ─────────────────────────────────────────────────────
  {
    const username = process.env.RALLY_USERNAME
    const password = process.env.RALLY_PASSWORD
    const log: string[] = []

    // Check basic connectivity first
    for (const url of [
      'https://rallythetroops.com',
      'https://www.rallythetroops.com',
      'https://rallythetroops.com/api',
      'https://rallythetroops.com/login',
    ]) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,application/json,*/*' },
          redirect: 'manual',
        })
        const body = await r.text()
        const loc = r.headers.get('location') ?? ''
        const ct = r.headers.get('content-type') ?? ''
        log.push(`GET ${url}: HTTP ${r.status} loc=${loc} ct=${ct} len=${body.length} body=${body.slice(0, 150)}`)
      } catch (e: any) {
        log.push(`GET ${url}: error=${e.message}`)
      }
    }

    if (!username || !password) {
      results.push({ name: 'rally', log, error: 'no credentials' })
    } else {
      // Try login variants
      const loginUrls = [
        'https://rallythetroops.com/login',
        'https://rallythetroops.com/api/login',
        'https://rallythetroops.com/api/auth/login',
        'https://rallythetroops.com/api/users/login',
        'https://rallythetroops.com/api/session',
      ]

      for (const url of loginUrls) {
        for (const [ct, body] of [
          ['application/json', JSON.stringify({ username, password })],
          ['application/json', JSON.stringify({ email: username, password })],
          ['application/x-www-form-urlencoded', new URLSearchParams({ username, password }).toString()],
        ] as [string, string][]) {
          try {
            const r = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': ct, Accept: 'application/json, text/html', 'User-Agent': 'Mozilla/5.0' },
              body,
              redirect: 'manual',
            })
            const resp = await r.text()
            const cookie = r.headers.get('set-cookie') ?? ''
            const loc = r.headers.get('location') ?? ''
            log.push(`POST ${url} (${ct.includes('json') ? 'json' : 'form'}): HTTP ${r.status} loc=${loc} cookie=${cookie.slice(0, 60)} body=${resp.slice(0, 150)}`)
            if (r.status < 400 && cookie) {
              log.push(`*** possible login success at ${url} ***`)
            }
          } catch (e: any) {
            log.push(`POST ${url}: error=${e.message}`)
          }
        }
      }

      results.push({ name: 'rally', log })
    }
  }

  return NextResponse.json(results)
}
