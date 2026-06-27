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

        // Step 1: get session cookie
        const initRes = await fetch('https://www.yucata.de/en', {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,*/*' },
          redirect: 'manual',
        })
        const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''
        log.push(`init HTTP ${initRes.status}, session cookie: ${sessionCookie}`)

        // Step 2: login via WCF AJAX service
        const loginRes = await fetch('https://www.yucata.de/Services/YucataService.svc/AuthenticateViaAjax', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json',
            Cookie: sessionCookie,
            Referer: 'https://www.yucata.de/en',
            'User-Agent': 'Mozilla/5.0',
          },
          body: JSON.stringify({ login: username, password, remember: false }),
        })
        const loginJson = await loginRes.json()
        const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
        log.push(`login HTTP ${loginRes.status}, response: ${JSON.stringify(loginJson)}, authCookie length: ${authCookie.length}`)

        if (!loginJson.d) {
          results.push({ name: 'yucata', error: 'login returned false', log })
        } else {
          // Need to send both session cookie AND auth cookie
          const combinedCookies = [sessionCookie, authCookie].filter(Boolean).join('; ')

          // Try WCF service endpoints first (JSON, cleaner)
          const wcfMethods = [
            'GetRunningGames',
            'GetMyGames',
            'GetGames',
            'GetOpenGames',
            'GetUserGames',
            'GetActiveGames',
            'GetUserOverview',
          ]
          for (const method of wcfMethods) {
            try {
              const r = await fetch(`https://www.yucata.de/Services/YucataService.svc/${method}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json; charset=utf-8',
                  Accept: 'application/json',
                  Cookie: combinedCookies,
                  'User-Agent': 'Mozilla/5.0',
                },
                body: '{}',
              })
              const txt = await r.text()
              log.push(`WCF ${method}: HTTP ${r.status} len=${txt.length} body=${txt.slice(0, 200)}`)
            } catch (e: any) {
              log.push(`WCF ${method}: error ${e.message}`)
            }
          }

          // Try HTML game page candidates
          const gameUrls = [
            '/en',
            '/en/',
            '/en/MyOverview',
            '/en/Overview',
            '/en/MyGames',
            '/en/Games',
            '/en/RunningGames',
            '/en/OpenGames',
            '/en/Home/Index',
            '/en/Game/Index',
            '/en/MyGames/Index',
          ]
          for (const path of gameUrls) {
            try {
              const gamesRes = await fetch(`https://www.yucata.de${path}`, {
                headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
                redirect: 'manual',
              })
              const html = await gamesRes.text()
              const location = gamesRes.headers.get('location') ?? ''
              log.push(`HTML ${path}: HTTP ${gamesRes.status} loc=${location} len=${html.length}`)
              if (gamesRes.status === 200 && html.length > 2000) {
                results.push({ name: 'yucata', success: true, log, gamesUrl: path, gamesHtml: html.slice(0, 5000) })
                break
              }
            } catch (e: any) {
              log.push(`HTML ${path}: error ${e.message}`)
            }
          }
          if (!results.find(r => r.name === 'yucata')) {
            results.push({ name: 'yucata', error: 'no valid games page found', log })
          }
        }
      } catch (e: any) {
        results.push({ name: 'yucata', error: e.message })
      }
    }
  }

  // ── CHOOCHOO ─────────────────────────────────────────────────────────────
  {
    const username = process.env.CHOOCHOO_USERNAME
    const password = process.env.CHOOCHOO_PASSWORD
    if (!username || !password) {
      results.push({ name: 'choochoo', error: 'no credentials' })
    } else {
      try {
        const log: string[] = []

        // Try different API base URLs
        const apiBases = ['https://api.choochoo.games/api', 'https://choochoo.games/api']
        let workingBase = ''

        for (const base of apiBases) {
          try {
            const testRes = await fetch(`${base}/xsrf`, {
              headers: { Accept: 'application/json' },
            })
            const testBody = await testRes.text()
            log.push(`XSRF at ${base}: HTTP ${testRes.status} body=${testBody.slice(0, 100)}`)
            if (testRes.ok) {
              workingBase = base
              break
            }
          } catch (e: any) {
            log.push(`XSRF at ${base}: error=${e.message}`)
          }
        }

        if (!workingBase) {
          // Try plain connectivity to main site
          try {
            const mainRes = await fetch('https://choochoo.games', { headers: { 'User-Agent': 'Mozilla/5.0' } })
            log.push(`Main site: HTTP ${mainRes.status}`)
          } catch (e: any) {
            log.push(`Main site: error=${e.message}`)
          }
          results.push({ name: 'choochoo', error: 'no working API base found', log })
        } else {
          // Get XSRF token
          const xsrfRes = await fetch(`${workingBase}/xsrf`, {
            headers: { Accept: 'application/json' },
          })
          const { xsrfToken } = await xsrfRes.json()
          const xsrfCookie = xsrfRes.headers.get('set-cookie')?.split(';')[0] ?? ''
          log.push(`xsrfToken: ${xsrfToken?.slice(0, 16)}... cookie: ${xsrfCookie}`)

          // Login
          const loginRes = await fetch(`${workingBase}/users/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'xsrf-token': xsrfToken,
              Cookie: xsrfCookie,
            },
            body: JSON.stringify({ usernameOrEmail: username, password }),
          })
          const loginJson = await loginRes.json()
          const authCookies = loginRes.headers.get('set-cookie') ?? ''
          const authCookie = authCookies.split(';')[0]
          log.push(`login HTTP ${loginRes.status}: ${JSON.stringify(loginJson).slice(0, 200)}, cookie: ${authCookie}`)

          if (!loginJson.success && !loginJson.body?.user) {
            results.push({ name: 'choochoo', error: 'login failed', loginJson, log })
          } else {
            const myId = loginJson.body?.user?.id ?? loginJson.user?.id
            log.push(`myId: ${myId}`)

            // Get games
            const allCookies = [xsrfCookie, authCookie].filter(Boolean).join('; ')
            const gamesRes = await fetch(`${workingBase}/games`, {
              headers: {
                Accept: 'application/json',
                Cookie: allCookies,
                'xsrf-token': xsrfToken,
              },
            })
            const gamesJson = await gamesRes.json()
            log.push(`games HTTP ${gamesRes.status}`)
            results.push({ name: 'choochoo', success: true, myId, log, gamesJson })
          }
        }
      } catch (e: any) {
        results.push({ name: 'choochoo', error: e.message, stack: e.stack?.slice(0, 300) })
      }
    }
  }

  return NextResponse.json(results)
}
