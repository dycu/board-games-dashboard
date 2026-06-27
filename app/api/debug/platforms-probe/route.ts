import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const results: any[] = []

  // ── YUCATA ──────────────────────────────────────────────────────────────
  {
    const username = process.env.YUCATA_USERNAME
    const password = process.env.YUCATA_PASSWORD
    if (!username || !password) {
      results.push({ name: 'yucata', error: 'no credentials' })
    } else {
      try {
        const log: string[] = []

        // Login
        const initRes = await fetch('https://www.yucata.de/en', {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,*/*' },
          redirect: 'manual',
        })
        const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''

        const loginRes = await fetch('https://www.yucata.de/Services/YucataService.svc/AuthenticateViaAjax', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json',
            Cookie: sessionCookie,
            'User-Agent': 'Mozilla/5.0',
          },
          body: JSON.stringify({ login: username, password, remember: false }),
        })
        const loginJson = await loginRes.json()
        const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
        if (!loginJson.d) {
          results.push({ name: 'yucata', error: 'login failed' })
          return NextResponse.json(results)
        }
        const combinedCookies = [sessionCookie, authCookie].filter(Boolean).join('; ')
        log.push('login ok')

        const wcfBase = 'https://www.yucata.de/Services/YucataService.svc'
        const hdrs = {
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'application/json',
          Cookie: combinedCookies,
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://www.yucata.de/en/Overview',
        }

        // GetLiveGames — most likely "currently running games for user"
        for (const body of ['{}', '{"filterValue":0}', '{"filterValue":2}', '{"userID":1031968}']) {
          const r = await fetch(`${wcfBase}/GetLiveGames`, { method: 'POST', headers: hdrs, body })
          const txt = await r.text()
          log.push(`GetLiveGames(${body}): HTTP ${r.status} len=${txt.length} body=${txt.slice(0, 500)}`)
        }

        // GetQuarantinedGames
        {
          const r = await fetch(`${wcfBase}/GetQuarantinedGames`, { method: 'POST', headers: hdrs, body: '{}' })
          const txt = await r.text()
          log.push(`GetQuarantinedGames: HTTP ${r.status} len=${txt.length} body=${txt.slice(0, 300)}`)
        }

        // GetPersonalInvitations (might expose running games too)
        {
          const r = await fetch(`${wcfBase}/GetPersonalInvitations`, { method: 'POST', headers: hdrs, body: '{}' })
          const txt = await r.text()
          log.push(`GetPersonalInvitations: HTTP ${r.status} len=${txt.length} body=${txt.slice(0, 300)}`)
        }

        results.push({ name: 'yucata', log })
      } catch (e: any) {
        results.push({ name: 'yucata', error: e.message })
      }
    }
  }

  // ── CHOOCHOO ─────────────────────────────────────────────────────────────
  {
    results.push({ name: 'choochoo', error: 'network unreachable from Vercel' })
  }

  return NextResponse.json(results)
}
