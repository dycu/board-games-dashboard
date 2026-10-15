import { request as httpsRequest } from 'https'

export const dynamic = 'force-dynamic'

const API_HOST = 'api.choochoo.games'

function req(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; body: string; cookies: string[] }> {
  return new Promise((resolve) => {
    const r = httpsRequest(
      { hostname: API_HOST, port: 443, path, method, headers, rejectUnauthorized: false, timeout: 15000 },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c })
        const cookies = (res.headers['set-cookie'] ?? []) as string[]
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data, cookies }))
      },
    )
    r.on('error', (e) => resolve({ status: 0, body: `ERROR: ${e.message}`, cookies: [] }))
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT', cookies: [] }) })
    if (body) r.write(body)
    r.end()
  })
}

// Temporary diagnostic: does choochoo's "Turn X/Y" summary mean "game turn X
// of Y" or "player X of Y players this round"? Dumps the raw game objects so
// we can compare summary text against playerIds.length and other fields.
export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME ?? ''
  const password = process.env.CHOOCHOO_PASSWORD ?? ''
  if (!username || !password) return Response.json({ error: 'credentials not configured' })

  const base = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

  const xsrfRes = await req('GET', '/api/xsrf', base)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch {}
  const xsrfCookie = xsrfRes.cookies.map(c => c.split(';')[0]).join('; ')
  if (!xsrfToken || !xsrfCookie) return Response.json({ error: `xsrf failed (status=${xsrfRes.status})` })

  const loginBody = JSON.stringify({ usernameOrEmail: username, password })
  const loginRes = await req('POST', '/api/users/login', {
    ...base,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginBody).toString(),
    'xsrf-token': xsrfToken,
    Cookie: xsrfCookie,
  }, loginBody)
  let loginJson: any = {}
  try { loginJson = JSON.parse(loginRes.body) } catch {}
  const myUserId: number = loginJson?.user?.id
  if (!myUserId) return Response.json({ error: `login failed (${loginRes.status}: ${loginRes.body.slice(0, 200)})` })
  const authCookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ') || xsrfCookie

  const gamesRes = await req('GET', `/api/games?status[]=ACTIVE&userId=${myUserId}`, { ...base, Cookie: authCookie })
  let gamesJson: any = {}
  try { gamesJson = JSON.parse(gamesRes.body) } catch {}
  const allGames: any[] = gamesJson.games ?? (Array.isArray(gamesJson) ? gamesJson : [])
  const myGames = allGames.filter((g: any) => Array.isArray(g.playerIds) && g.playerIds.includes(myUserId))

  return Response.json({
    myUserId,
    games: myGames.map((g: any) => ({
      id: g.id, name: g.name, gameKey: g.gameKey, summary: g.summary,
      playerIds: g.playerIds, playerCount: g.playerIds?.length,
      activePlayerId: g.activePlayerId, status: g.status,
    })),
  })
}
