import { getPrefs } from '@/lib/prefs'

const BASE = 'https://18xx.games'

function formatCookie(sessionCookie: string): string {
  return sessionCookie.includes('=') ? sessionCookie : `auth_token=${sessionCookie}`
}

export async function GET() {
  const prefs = await getPrefs()
  const cookie = formatCookie(prefs.eighteenxxSessionCookie ?? '')
  const timings: Record<string, number> = {}

  const t0 = Date.now()
  let status = 0
  let bodySnippet = ''
  try {
    const res = await fetch(`${BASE}/api/game/user`, { headers: { Cookie: cookie, Accept: 'application/json' } })
    status = res.status
    const text = await res.text()
    bodySnippet = text.slice(0, 300)
  } catch (e) {
    bodySnippet = `FETCH ERROR: ${e instanceof Error ? e.message : String(e)}`
  }
  timings.gamesUserMs = Date.now() - t0

  return Response.json({ timings, status, bodySnippet, cookieLength: cookie.length })
}
