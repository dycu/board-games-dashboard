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

        // Search JS for GetLiveGames and d.Games context
        const bundleRes = await fetch('https://www.yucata.de/bundles/mpscripts4', {
          headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0' },
        })
        const bundleJs = await bundleRes.text()

        const liveGamesIdx = bundleJs.indexOf('GetLiveGames')
        if (liveGamesIdx >= 0) {
          log.push(`GetLiveGames context: ${bundleJs.slice(Math.max(0, liveGamesIdx - 200), liveGamesIdx + 400)}`)
        }

        const dGamesIdx = bundleJs.indexOf('data.d.Games')
        if (dGamesIdx >= 0) {
          log.push(`data.d.Games context: ${bundleJs.slice(Math.max(0, dGamesIdx - 300), dGamesIdx + 200)}`)
        }

        // Also search for any WCF call that loads running/current games
        const gamesCallCtx = [...bundleJs.matchAll(/.{0,100}(?:currentGamesData|LiveGames|runningGames).{0,100}/g)]
          .map(m => m[0]).slice(0, 8)
        log.push(`currentGames/LiveGames contexts: ${gamesCallCtx.join(' || ')}`)

        const wcfBase = 'https://www.yucata.de/Services/YucataService.svc'

        // Try GetLiveGames with various bodies
        for (const body of ['{}', '{"userID":1031968}', '{"userHash":"D09DD64FBFA5D8DB18A26CD681821B05"}', '{"filterValue":0}']) {
          const r = await fetch(`${wcfBase}/GetLiveGames`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              Accept: 'application/json',
              Cookie: combinedCookies,
              'User-Agent': 'Mozilla/5.0',
              Referer: 'https://www.yucata.de/en/Overview',
            },
            body,
          })
          const txt = await r.text()
          log.push(`GetLiveGames(${body}): HTTP ${r.status} len=${txt.length} body=${txt.slice(0, 400)}`)
        }

        // Also try GetQuarantinedGames (might be "paused/waiting" games)
        const qr = await fetch(`${wcfBase}/GetQuarantinedGames`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json',
            Cookie: combinedCookies,
            'User-Agent': 'Mozilla/5.0',
          },
          body: '{}',
        })
        const qtxt = await qr.text()
        log.push(`GetQuarantinedGames: HTTP ${qr.status} len=${qtxt.length} body=${qtxt.slice(0, 400)}`)

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
