import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function probeLogin(
  name: string,
  base: string,
  loginUrl: string,
  bodyVariants: Record<string, string>[],
  gamesUrl: string,
) {
  const log: string[] = []

  for (const body of bodyVariants) {
    const safeBody = JSON.stringify(body).replace(body.password ?? '', '***')
    log.push(`[${name}] POST ${loginUrl} body=${safeBody}`)

    // Try form-encoded
    for (const ct of ['application/x-www-form-urlencoded', 'application/json']) {
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': ct,
          Accept: 'text/html,application/json,*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: base,
        },
        body: ct.includes('json') ? JSON.stringify(body) : new URLSearchParams(body as any).toString(),
        redirect: 'manual',
      })
      const setCookie = res.headers.get('set-cookie') ?? ''
      const location = res.headers.get('location') ?? ''
      const text = await res.text()
      log.push(`  ${ct} → HTTP ${res.status} location=${location} set-cookie=${setCookie.slice(0, 80)} body=${text.slice(0, 200)}`)

      if (res.status === 200 || res.status === 302) {
        const cookie = setCookie.split(';')[0]
        if (cookie) {
          // Try fetching games page
          const gamesRes = await fetch(gamesUrl, {
            headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,application/json,*/*' },
          })
          const gamesText = await gamesRes.text()
          log.push(`  Games page HTTP ${gamesRes.status}: ${gamesText.slice(0, 800)}`)
          return { name, success: true, cookie, loginBody: body, loginCt: ct, log }
        }
      }
    }
  }

  return { name, success: false, log }
}

export async function GET() {
  const platforms = [
    {
      name: 'obg',
      base: 'https://www.onlineboardgamers.com',
      loginUrl: 'https://www.onlineboardgamers.com/login',
      gamesUrl: 'https://www.onlineboardgamers.com/my-games',
    },
    {
      name: 'yucata',
      base: 'https://www.yucata.de',
      loginUrl: 'https://www.yucata.de/en/Login',
      gamesUrl: 'https://www.yucata.de/en/MyGames',
    },
    {
      name: 'choochoo',
      base: 'https://www.choochoo.games',
      loginUrl: 'https://www.choochoo.games/login',
      gamesUrl: 'https://www.choochoo.games/games',
    },
    {
      name: 'rally',
      base: 'https://rallythetroops.com',
      loginUrl: 'https://rallythetroops.com/login',
      gamesUrl: 'https://rallythetroops.com/my-games',
    },
  ]

  const results: any[] = []

  for (const p of platforms) {
    const username = process.env[`${p.name.toUpperCase()}_USERNAME`]
    const password = process.env[`${p.name.toUpperCase()}_PASSWORD`]
    if (!username || !password) {
      results.push({ name: p.name, success: false, log: ['no credentials set'] })
      continue
    }

    const variants: Record<string, string>[] = [
      { username, password },
      { email: username, password },
      { login: username, password },
      { user: username, password },
    ]

    const result = await probeLogin(p.name, p.base, p.loginUrl, variants, p.gamesUrl)
    results.push(result)
  }

  return NextResponse.json(results)
}
