import { withYucataSession } from '@/lib/connectors/yucata'

// Temporary: inspect the raw Yucata current-games JSON for an avatar/image
// field not captured by the connector's documented PlayerInfo fields.
// Delete after use.
const BASE = 'https://www.yucata.de'

export async function GET() {
  const username = process.env.YUCATA_USERNAME ?? ''
  const password = process.env.YUCATA_PASSWORD ?? ''
  const result = await withYucataSession(username, password, async jar => {
    const cookieHeader = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await fetch(`${BASE}/api/user/me/games/current`, {
      headers: { Accept: 'application/json', Cookie: cookieHeader, 'User-Agent': 'Mozilla/5.0', Referer: `${BASE}/en/Overview` },
    })
    return res.json()
  })
  return Response.json({ result })
}
