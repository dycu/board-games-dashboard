import { kv } from '@vercel/kv'
import { fetchOBG } from '@/lib/connectors/obg'

// Temporary: OBG's games table only has plain player-name links, but its
// users have full profile pages (/profile/<name>/) — checking whether an
// opponent's own profile page has an avatar image worth hotlinking.
// Delete after use.
const BASE = 'https://www.onlineboardgamers.com'
const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' }

export async function GET() {
  try {
    const username = process.env.OBG_USERNAME ?? ''
    const password = process.env.OBG_PASSWORD ?? ''
    const games = await fetchOBG(username, password)
    const opponentName = games[0]?.players[0]
    if (!opponentName) return Response.json({ error: 'no opponent found in active games', games })

    const session = await kv.get<{ cookieHeader: string }>('obg-session')
    if (!session) return Response.json({ error: 'no cached OBG session after fetchOBG — unexpected' })

    const res = await fetch(`${BASE}/profile/${opponentName}/`, { headers: { ...BROWSER, Cookie: session.cookieHeader } })
    const html = await res.text()
    const matches = html.match(/[^"'\s]*(?:avatar|photo|profile[-_]?pic)[^"'\s]*/gi) ?? []
    return Response.json({ opponentName, matches: [...new Set(matches)].slice(0, 30) })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined })
  }
}
