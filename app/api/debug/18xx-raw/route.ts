import { getPrefs } from '@/lib/prefs'
import { parseProfileGames } from '@/lib/connectors/eighteenxx'

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

  const resolvedId = games.flatMap(g => g.players ?? []).find((p: any) => p.name === username)?.id

  const profileRes = await fetch(`${BASE}/profile/${resolvedId}`, { headers: { Accept: 'text/html' } })
  const profileHtml = await profileRes.text()
  let finishedSample: any = null
  let finishedKeys: string[] = []
  try {
    const profileGames = parseProfileGames(profileHtml)
    const finished = profileGames.find((g: any) => g.status === 'finished' || g.status === 'archived')
    finishedSample = finished ?? null
    finishedKeys = finished ? Object.keys(finished) : []
  } catch (e) {
    finishedSample = { parseError: e instanceof Error ? e.message : String(e) }
  }

  return Response.json({
    totalCount: games.length,
    activeCount: active.length,
    firstActiveGame: active[0] ?? null,
    allKeysOfFirst: active[0] ? Object.keys(active[0]) : [],
    resolvedId,
    finishedSample,
    finishedKeys,
  })
}
