import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const API = 'https://api.choochoo.games'

async function req(url: string, opts?: RequestInit): Promise<{ status: number; body: string; cookies: string }> {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) })
    const body = await r.text()
    return { status: r.status, body: body.slice(0, 800), cookies: r.headers.get('set-cookie') ?? '' }
  } catch (e: any) {
    return { status: 0, body: e.message, cookies: '' }
  }
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'CHOOCHOO_USERNAME / CHOOCHOO_PASSWORD not set' }, { status: 500 })
  }

  // Step 1: login
  const loginRes = await req(`${API}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ usernameOrEmail: username, password }),
  })
  const sessionCookie = loginRes.cookies.split(';')[0]

  let loginJson: any
  try { loginJson = JSON.parse(loginRes.body) } catch { loginJson = null }

  if (loginRes.status >= 400 || !sessionCookie) {
    return NextResponse.json({ error: 'login failed', loginRes, loginJson }, { status: 500 })
  }

  // Step 2: get /users/me to understand user object
  const meRes = await req(`${API}/users/me`, {
    headers: { Accept: 'application/json', Cookie: sessionCookie, 'User-Agent': 'Mozilla/5.0' },
  })
  let meJson: any
  try { meJson = JSON.parse(meRes.body) } catch { meJson = null }

  // Step 3: get games
  const gamesRes = await req(`${API}/games`, {
    headers: { Accept: 'application/json', Cookie: sessionCookie, 'User-Agent': 'Mozilla/5.0' },
  })
  let gamesJson: any
  try { gamesJson = JSON.parse(gamesRes.body) } catch { gamesJson = null }

  const games: any[] = gamesJson?.games ?? gamesJson?.body?.games ?? (Array.isArray(gamesJson) ? gamesJson : [])
  const firstGame = games[0]
  const firstGameKeys = firstGame ? Object.keys(firstGame) : []
  const firstPlayer = firstGame?.players?.[0] ?? firstGame?.Players?.[0] ?? null
  const firstPlayerKeys = firstPlayer ? Object.keys(firstPlayer) : []

  return NextResponse.json({
    loginStatus: loginRes.status,
    sessionCookie: sessionCookie.slice(0, 40),
    loginJsonKeys: loginJson ? Object.keys(loginJson) : [],
    meStatus: meRes.status,
    meJson,
    gamesStatus: gamesRes.status,
    gamesTopLevelKeys: gamesJson ? Object.keys(gamesJson) : [],
    gameCount: games.length,
    firstGameKeys,
    firstPlayerKeys,
    firstGameSample: firstGame ? JSON.stringify(firstGame).slice(0, 800) : null,
    gameSamples: games.slice(0, 2),
  })
}
