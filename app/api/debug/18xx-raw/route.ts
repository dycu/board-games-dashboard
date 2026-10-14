import { getPrefs } from '@/lib/prefs'

const BASE = 'https://18xx.games'

function formatCookie(sessionCookie: string): string {
  return sessionCookie.includes('=') ? sessionCookie : `auth_token=${sessionCookie}`
}

export async function GET() {
  const prefs = await getPrefs()
  const username = process.env.EIGHTEENXX_USERNAME ?? ''
  const password = process.env.EIGHTEENXX_PASSWORD ?? ''

  let cookie: string
  if (prefs.eighteenxxSessionCookie) {
    cookie = formatCookie(prefs.eighteenxxSessionCookie)
  } else {
    const loginRes = await fetch(`${BASE}/api/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: username, password }),
    })
    if (!loginRes.ok) return Response.json({ error: 'login failed' }, { status: 500 })
    cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  }

  const gamesRes = await fetch(`${BASE}/api/game/user`, {
    headers: { Cookie: cookie, Accept: 'application/json' },
  })
  if (!gamesRes.ok) return Response.json({ error: `games fetch failed HTTP ${gamesRes.status}` }, { status: 500 })

  const data = await gamesRes.json()
  const games: any[] = Array.isArray(data) ? data : data.games ?? []
  const active = games.filter(g => g.status === 'active')

  return Response.json({
    totalCount: games.length,
    activeCount: active.length,
    firstActiveGame: active[0] ?? null,
    allKeysOfFirst: active[0] ? Object.keys(active[0]) : [],
  })
}
