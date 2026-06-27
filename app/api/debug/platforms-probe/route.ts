import { NextResponse } from 'next/server'
import dns from 'dns/promises'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const results: any[] = []

  // ── CHOOCHOO DNS + CONNECTIVITY ──────────────────────────────────────────
  {
    const username = process.env.CHOOCHOO_USERNAME
    const password = process.env.CHOOCHOO_PASSWORD
    const log: string[] = []

    // DNS lookup first
    for (const host of ['choochoo.games', 'api.choochoo.games', 'www.choochoo.games']) {
      try {
        const addrs = await dns.resolve4(host)
        log.push(`DNS ${host}: ${addrs.join(', ')}`)
      } catch (e: any) {
        log.push(`DNS ${host}: error=${e.message}`)
      }
    }

    // Connectivity attempts
    const urls = [
      'https://choochoo.games',
      'https://www.choochoo.games',
      'https://api.choochoo.games',
      'https://api.choochoo.games/api/xsrf',
      'https://choochoo.games/api/xsrf',
    ]
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json, text/html' },
          signal: AbortSignal.timeout(10000),
        })
        const body = await r.text()
        log.push(`GET ${url}: HTTP ${r.status} len=${body.length} body=${body.slice(0, 100)}`)
      } catch (e: any) {
        log.push(`GET ${url}: error=${e.message} (${e.cause?.message ?? e.cause ?? ''})`)
      }
    }

    if (!username || !password) {
      results.push({ name: 'choochoo', log, error: 'no credentials' })
    } else {
      // If any URL worked, try the XSRF + login flow
      const workingXsrf = log.find(l => l.includes('/xsrf') && l.includes('HTTP 200'))
      if (workingXsrf) {
        try {
          const base = workingXsrf.includes('api.choochoo') ? 'https://api.choochoo.games/api' : 'https://choochoo.games/api'
          const xsrfRes = await fetch(`${base}/xsrf`, { headers: { Accept: 'application/json' } })
          const { xsrfToken } = await xsrfRes.json()
          const xsrfCookie = xsrfRes.headers.get('set-cookie')?.split(';')[0] ?? ''

          const loginRes = await fetch(`${base}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'xsrf-token': xsrfToken, Cookie: xsrfCookie },
            body: JSON.stringify({ usernameOrEmail: username, password }),
          })
          const loginJson = await loginRes.json()
          const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
          log.push(`login: HTTP ${loginRes.status} body=${JSON.stringify(loginJson).slice(0, 200)}`)

          if (loginJson.success || loginJson.body?.user) {
            const allCookies = [xsrfCookie, authCookie].filter(Boolean).join('; ')
            const gamesRes = await fetch(`${base}/games`, {
              headers: { Accept: 'application/json', Cookie: allCookies, 'xsrf-token': xsrfToken },
            })
            const gamesJson = await gamesRes.json()
            log.push(`games: HTTP ${gamesRes.status}`)
            results.push({ name: 'choochoo', success: true, log, gamesJson })
          } else {
            results.push({ name: 'choochoo', error: 'login failed', log })
          }
        } catch (e: any) {
          results.push({ name: 'choochoo', error: e.message, log })
        }
      } else {
        results.push({ name: 'choochoo', error: 'all endpoints unreachable', log })
      }
    }
  }

  return NextResponse.json(results)
}
