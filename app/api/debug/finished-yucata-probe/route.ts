import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BASE = 'https://www.yucata.de'

export async function GET() {
  const username = process.env.YUCATA_USERNAME
  const password = process.env.YUCATA_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const log: string[] = []
  try {
    const initRes = await fetch(`${BASE}/en`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, redirect: 'manual' })
    const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''

    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Cookie: sessionCookie, 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ login: username, password, remember: false }),
    })
    const loginData = await loginRes.json()
    if (!loginData.success) return NextResponse.json({ error: 'Yucata login failed', log }, { status: 500 })
    const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
    const cookies = [sessionCookie, authCookie].filter(Boolean).join('; ')
    log.push('login ok')

    // Try REST endpoints that might return finished/historical games
    // (Overview's "recently finished" widget calls GET /api/datatables/-1/recent-finished)
    const attempts: any[] = []
    for (const path of [
      '/api/datatables/-1/recent-finished',
      '/api/user/me/games/finished',
      '/api/user/me/games/recent-finished',
    ]) {
      const r = await fetch(`${BASE}${path}`, {
        headers: { Accept: 'application/json', Cookie: cookies, 'User-Agent': 'Mozilla/5.0', Referer: `${BASE}/en/Overview` },
      })
      let parsed: any = null
      const bodyText = await r.text()
      try { parsed = JSON.parse(bodyText) } catch {}
      const games = Array.isArray(parsed) ? parsed : parsed?.games ?? null
      attempts.push({
        path,
        status: r.status,
        hasGames: Array.isArray(games),
        gameCount: Array.isArray(games) ? games.length : null,
        preview: bodyText.slice(0, 200),
      })
    }

    // Also check the active games response to understand what fields exist
    const liveRes = await fetch(`${BASE}/api/user/me/games/current`, {
      headers: { Accept: 'application/json', Cookie: cookies, 'User-Agent': 'Mozilla/5.0', Referer: `${BASE}/en/Overview` },
    })
    const liveData = await liveRes.json()
    const liveGames: any[] = liveData.games ?? []
    const firstGame = liveGames[0]
    log.push(`games/current: ${liveGames.length} games`)
    log.push(`Sample game keys: ${firstGame ? Object.keys(firstGame).join(', ') : 'none'}`)

    return NextResponse.json({ log, attempts, sampleLiveGame: firstGame ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
