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
        })
        const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''
        log.push(`session cookie: ${sessionCookie}`)

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
        const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? sessionCookie
        log.push(`login response: ${JSON.stringify(loginJson)}, authCookie: ${authCookie}`)

        if (!loginJson.d) {
          results.push({ name: 'yucata', error: 'login returned false', log })
        } else {
          // Step 3: fetch games page
          const gamesRes = await fetch('https://www.yucata.de/en/MyGames', {
            headers: { Cookie: authCookie, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
          })
          const html = await gamesRes.text()
          log.push(`games page HTTP ${gamesRes.status}, length ${html.length}`)
          results.push({ name: 'yucata', success: true, log, gamesHtml: html.slice(0, 3000) })
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
        const API = 'https://api.choochoo.games/api'

        // Step 1: get XSRF token
        const xsrfRes = await fetch(`${API}/xsrf`, {
          headers: { Accept: 'application/json' },
        })
        const { xsrfToken } = await xsrfRes.json()
        const xsrfCookie = xsrfRes.headers.get('set-cookie')?.split(';')[0] ?? ''
        log.push(`xsrfToken: ${xsrfToken?.slice(0, 16)}... cookie: ${xsrfCookie}`)

        // Step 2: login
        const loginRes = await fetch(`${API}/users/login`, {
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
        log.push(`login: ${JSON.stringify(loginJson).slice(0, 200)}, cookie: ${authCookie}`)

        if (!loginJson.success && !loginJson.body?.user) {
          results.push({ name: 'choochoo', error: 'login failed', loginJson, log })
        } else {
          const myId = loginJson.body?.user?.id ?? loginJson.user?.id
          log.push(`myId: ${myId}`)

          // Step 3: get games
          const allCookies = [xsrfCookie, authCookie].filter(Boolean).join('; ')
          const gamesRes = await fetch(`${API}/games`, {
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
      } catch (e: any) {
        results.push({ name: 'choochoo', error: e.message })
      }
    }
  }

  return NextResponse.json(results)
}
