import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'CHOOCHOO_USERNAME / CHOOCHOO_PASSWORD not set' }, { status: 500 })
  }

  const log: string[] = []

  // Step 1: find working API base by probing known URL patterns
  const apiBases = [
    'https://www.choochoo.games/api',
    'https://choochoo.games/api',
    'https://api.choochoo.games',
    'https://www.choochoo.games',
    'https://choochoo.games',
  ]

  const xsrfPaths = ['/xsrf', '/csrf', '/token', '/auth/csrf']

  let workingBase = ''
  let xsrfToken = ''
  let xsrfCookie = ''

  for (const base of apiBases) {
    for (const path of xsrfPaths) {
      try {
        const r = await fetch(`${base}${path}`, {
          headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(6000),
        })
        const txt = await r.text()
        log.push(`${base}${path}: HTTP ${r.status} body=${txt.slice(0, 120)}`)
        if (r.ok && txt.includes('{')) {
          try {
            const j = JSON.parse(txt)
            const tok = j.xsrfToken ?? j.csrfToken ?? j.token ?? ''
            if (tok) {
              xsrfToken = tok
              xsrfCookie = (r.headers.get('set-cookie') ?? '').split(';')[0]
              workingBase = base
              log.push(`→ found xsrf at ${base}${path} token=${tok.slice(0, 16)}...`)
              break
            }
          } catch {}
        }
      } catch (e: any) {
        log.push(`${base}${path}: error=${e.message}`)
      }
    }
    if (workingBase) break
  }

  if (!workingBase) {
    // Step 2: try login directly with form POST (no xsrf needed)
    for (const base of ['https://www.choochoo.games', 'https://choochoo.games']) {
      for (const loginPath of ['/login', '/api/login', '/api/auth/login', '/api/users/login', '/auth/login']) {
        try {
          const r = await fetch(`${base}${loginPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
            body: JSON.stringify({ username, password, usernameOrEmail: username, email: username }),
            signal: AbortSignal.timeout(6000),
          })
          const txt = await r.text()
          log.push(`POST ${base}${loginPath}: HTTP ${r.status} body=${txt.slice(0, 150)}`)
        } catch (e: any) {
          log.push(`POST ${base}${loginPath}: error=${e.message}`)
        }
      }
    }
    return NextResponse.json({ error: 'no xsrf endpoint found', log }, { status: 500 })
  }

  // Step 3: login
  const loginRes = await fetch(`${workingBase}/users/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'xsrf-token': xsrfToken,
      Cookie: xsrfCookie,
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ usernameOrEmail: username, password }),
    signal: AbortSignal.timeout(10000),
  })
  const loginText = await loginRes.text()
  const authCookie = (loginRes.headers.get('set-cookie') ?? '').split(';')[0]
  log.push(`login: HTTP ${loginRes.status} body=${loginText.slice(0, 200)} authCookie=${authCookie.slice(0, 40)}`)

  let loginJson: any
  try { loginJson = JSON.parse(loginText) } catch { loginJson = null }
  if (!loginJson?.success && !loginJson?.body?.user) {
    return NextResponse.json({ error: 'login failed', log }, { status: 500 })
  }

  const allCookies = [xsrfCookie, authCookie].filter(Boolean).join('; ')

  // Step 4: get games
  for (const gamesPath of ['/games', '/api/games', '/game', '/api/game']) {
    try {
      const r = await fetch(`${workingBase}${gamesPath}`, {
        headers: { Accept: 'application/json', Cookie: allCookies, 'xsrf-token': xsrfToken, 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      })
      const txt = await r.text()
      log.push(`GET ${gamesPath}: HTTP ${r.status} body=${txt.slice(0, 500)}`)
    } catch (e: any) {
      log.push(`GET ${gamesPath}: error=${e.message}`)
    }
  }

  return NextResponse.json({ log, workingBase })
}
