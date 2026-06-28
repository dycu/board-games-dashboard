import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
export const runtime = 'edge'  // try edge runtime for TLS

const API = 'https://api.choochoo.games'

async function req(url: string, opts?: RequestInit): Promise<{ status: number; body: string; cookies: string }> {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) })
    const body = await r.text()
    return { status: r.status, body: body.slice(0, 800), cookies: r.headers.get('set-cookie') ?? '' }
  } catch (e: any) {
    return { status: 0, body: `${e.name}: ${e.message} (cause: ${e.cause?.message ?? 'none'})`, cookies: '' }
  }
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'CHOOCHOO_USERNAME / CHOOCHOO_PASSWORD not set' })
  }

  const loginRes = await req(`${API}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ usernameOrEmail: username, password }),
  })
  const sessionCookie = loginRes.cookies.split(';')[0]

  if (loginRes.status === 0 || loginRes.status >= 400 || !sessionCookie) {
    // Also test raw connectivity
    const pingRes = await req(`${API}`)
    return NextResponse.json({
      error: 'login failed',
      loginRes,
      pingRes,
      runtime: 'edge',
    })
  }

  const meRes = await req(`${API}/users/me`, {
    headers: { Accept: 'application/json', Cookie: sessionCookie, 'User-Agent': 'Mozilla/5.0' },
  })

  const gamesRes = await req(`${API}/games`, {
    headers: { Accept: 'application/json', Cookie: sessionCookie, 'User-Agent': 'Mozilla/5.0' },
  })

  let gamesJson: any
  try { gamesJson = JSON.parse(gamesRes.body) } catch { gamesJson = null }
  const games: any[] = gamesJson?.games ?? (Array.isArray(gamesJson) ? gamesJson : [])

  return NextResponse.json({
    runtime: 'edge',
    loginStatus: loginRes.status,
    sessionCookie: sessionCookie.slice(0, 40),
    meStatus: meRes.status,
    meBody: meRes.body.slice(0, 300),
    gamesStatus: gamesRes.status,
    gameCount: games.length,
    firstGameKeys: games[0] ? Object.keys(games[0]) : [],
    gameSamples: games.slice(0, 2),
  })
}
