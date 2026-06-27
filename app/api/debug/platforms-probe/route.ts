import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const results: any[] = []

  // ── OBG ──────────────────────────────────────────────────────────────────
  {
    const username = process.env.OBG_USERNAME
    const password = process.env.OBG_PASSWORD
    const log: string[] = []

    const BROWSER = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    }

    // Try main site and API paths with full browser headers
    for (const url of [
      'https://www.onlineboardgamers.com',
      'https://www.onlineboardgamers.com/api',
      'https://www.onlineboardgamers.com/api/games',
      'https://www.onlineboardgamers.com/api/v1/games',
      'https://www.onlineboardgamers.com/graphql',
      'https://api.onlineboardgamers.com',
    ]) {
      try {
        const r = await fetch(url, { headers: BROWSER, redirect: 'manual' })
        const body = await r.text()
        const isCF = body.includes('Just a moment') || body.includes('Checking your browser')
        log.push(`GET ${url}: HTTP ${r.status} CF=${isCF} body=${body.slice(0, 100)}`)
      } catch (e: any) {
        log.push(`GET ${url}: error=${e.message}`)
      }
    }

    // Try JSON API login (different Sec-Fetch mode — might bypass CF challenge)
    if (username && password) {
      for (const url of [
        'https://www.onlineboardgamers.com/api/auth/login',
        'https://www.onlineboardgamers.com/api/login',
        'https://www.onlineboardgamers.com/api/v1/auth/login',
      ]) {
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers: {
              ...BROWSER,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'same-origin',
            },
            body: JSON.stringify({ email: username, password }),
          })
          const resp = await r.text()
          const isCF = resp.includes('Just a moment')
          log.push(`POST ${url}: HTTP ${r.status} CF=${isCF} body=${resp.slice(0, 150)}`)
        } catch (e: any) {
          log.push(`POST ${url}: error=${e.message}`)
        }
      }
    }

    results.push({ name: 'obg', log })
  }

  // ── CHOOCHOO ─────────────────────────────────────────────────────────────
  {
    const username = process.env.CHOOCHOO_USERNAME
    const password = process.env.CHOOCHOO_PASSWORD
    const log: string[] = []

    if (!username || !password) {
      results.push({ name: 'choochoo', error: 'no credentials' })
    } else {
      try {
        // www.choochoo.games is on CloudFront with valid cert — try API paths there
        // api.choochoo.games has a bad TLS chain so we try www + /api paths instead
        const apiBases = [
          'https://www.choochoo.games/api',
          'https://choochoo.games/api',
        ]

        let workingBase = ''
        for (const base of apiBases) {
          try {
            const r = await fetch(`${base}/xsrf`, {
              headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(8000),
            })
            const txt = await r.text()
            log.push(`xsrf at ${base}: HTTP ${r.status} body=${txt.slice(0, 100)}`)
            if (r.ok) { workingBase = base; break }
          } catch (e: any) {
            log.push(`xsrf at ${base}: error=${e.message}`)
          }
        }

        if (!workingBase) {
          results.push({ name: 'choochoo', error: 'no working API base', log })
        } else {
          const xsrfRes = await fetch(`${workingBase}/xsrf`, { headers: { Accept: 'application/json' } })
          const xsrfJson = await xsrfRes.json() as any
          const xsrfToken: string = xsrfJson.xsrfToken ?? ''
          const xsrfCookie = (xsrfRes.headers.get('set-cookie') ?? '').split(';')[0]
          log.push(`xsrf token=${xsrfToken.slice(0, 16)}...`)

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
          const loginJson = await loginRes.json() as any
          const authCookie = (loginRes.headers.get('set-cookie') ?? '').split(';')[0]
          log.push(`login: HTTP ${loginRes.status} body=${JSON.stringify(loginJson).slice(0, 200)}`)

          if (loginJson.success || loginJson.body?.user) {
            const allCookies = [xsrfCookie, authCookie].filter(Boolean).join('; ')
            const gamesRes = await fetch(`${workingBase}/games`, {
              headers: { Accept: 'application/json', Cookie: allCookies, 'xsrf-token': xsrfToken },
            })
            const gamesJson = await gamesRes.json() as any
            results.push({ name: 'choochoo', success: true, log, gamesJson })
          } else {
            results.push({ name: 'choochoo', error: 'login failed', log })
          }
        }
      } catch (e: any) {
        results.push({ name: 'choochoo', error: e.message, log })
      }
    }
  }

  return NextResponse.json(results)
}
