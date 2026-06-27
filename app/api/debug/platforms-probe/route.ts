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

        // Search JS bundle for loadGamesAndGamesTags function body
        const bundleRes = await fetch('https://www.yucata.de/bundles/mpscripts4', {
          headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0' },
        })
        const bundleJs = await bundleRes.text()

        // Extract the loadGamesAndGamesTags function to see its URL and body
        const fnIdx = bundleJs.indexOf('loadGamesAndGamesTags')
        if (fnIdx >= 0) {
          log.push(`loadGamesAndGamesTags context: ${bundleJs.slice(fnIdx, fnIdx + 600)}`)
        }

        // Also find currentGamesData assignment
        const cgdIdx = bundleJs.indexOf('currentGamesData=')
        if (cgdIdx >= 0) {
          log.push(`currentGamesData= context: ${bundleJs.slice(cgdIdx, cgdIdx + 300)}`)
        }

        // Try GetGamesList with various bodies
        const wcfBase = 'https://www.yucata.de/Services/YucataService.svc'
        const methods = [
          { name: 'GetGamesList', bodies: ['{}', '{"userID":1031968}', '{"userHash":"D09DD64FBFA5D8DB18A26CD681821B05"}'] },
          { name: 'GetLiveGames', bodies: ['{}', '{"userID":1031968}'] },
          { name: 'GetQuarantinedGames', bodies: ['{}'] },
          { name: 'GetPersonalInvitations', bodies: ['{}'] },
        ]

        for (const { name, bodies } of methods) {
          for (const body of bodies) {
            const r = await fetch(`${wcfBase}/${name}`, {
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
            log.push(`${name}(${body}): HTTP ${r.status} len=${txt.length} body=${txt.slice(0, 300)}`)
            if (r.ok && txt.length > 100 && !txt.includes('DOCTYPE')) {
              results.push({ name: 'yucata', success: true, method: name, body, log, responseJson: txt.slice(0, 8000) })
              return NextResponse.json(results)
            }
          }
        }

        results.push({ name: 'yucata', error: 'no working API found', log })
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
