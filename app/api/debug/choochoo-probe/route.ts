import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const API = 'https://www.choochoo.games/api'

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'CHOOCHOO_USERNAME / CHOOCHOO_PASSWORD not set' }, { status: 500 })
  }

  const log: string[] = []

  try {
    // Step 1: get XSRF token
    const xsrfRes = await fetch(`${API}/xsrf`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    })
    const xsrfJson = await xsrfRes.json() as any
    const xsrfToken: string = xsrfJson.xsrfToken ?? ''
    const xsrfCookie = (xsrfRes.headers.get('set-cookie') ?? '').split(';')[0]
    log.push(`xsrf: HTTP ${xsrfRes.status} token=${xsrfToken.slice(0, 16)}... cookie=${xsrfCookie.slice(0, 40)}`)

    if (!xsrfToken) {
      return NextResponse.json({ error: 'no xsrf token', log, xsrfJson }, { status: 500 })
    }

    // Step 2: login
    const loginRes = await fetch(`${API}/users/login`, {
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
    const loginJson = await loginRes.json() as any
    const authCookie = (loginRes.headers.get('set-cookie') ?? '').split(';')[0]
    log.push(`login: HTTP ${loginRes.status} body=${JSON.stringify(loginJson).slice(0, 200)} authCookie=${authCookie.slice(0, 40)}`)

    if (!loginJson.success && !loginJson.body?.user) {
      return NextResponse.json({ error: 'login failed', log, loginJson }, { status: 500 })
    }

    const allCookies = [xsrfCookie, authCookie].filter(Boolean).join('; ')

    // Step 3: get games list
    const gamesRes = await fetch(`${API}/games`, {
      headers: {
        Accept: 'application/json',
        Cookie: allCookies,
        'xsrf-token': xsrfToken,
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(15000),
    })
    const gamesText = await gamesRes.text()
    log.push(`games: HTTP ${gamesRes.status} len=${gamesText.length}`)

    let gamesJson: any
    try { gamesJson = JSON.parse(gamesText) } catch { gamesJson = null }

    // Inspect response shape
    const topLevelKeys = gamesJson ? Object.keys(gamesJson) : []
    const games: any[] = gamesJson?.games ?? gamesJson?.body?.games ?? gamesJson?.data ?? (Array.isArray(gamesJson) ? gamesJson : [])
    log.push(`games array len=${games.length}`)

    const firstGame = games[0] ?? null
    const firstGameKeys = firstGame ? Object.keys(firstGame) : []
    const gameSamples = games.slice(0, 3)

    return NextResponse.json({
      log,
      topLevelKeys,
      gameCount: games.length,
      firstGameKeys,
      gameSamples,
      rawPreview: gamesText.slice(0, 1000),
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e), log }, { status: 500 })
  }
}
