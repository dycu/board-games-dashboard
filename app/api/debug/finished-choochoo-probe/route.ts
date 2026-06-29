import { request as httpsRequest } from 'https'

export const dynamic = 'force-dynamic'

const API_HOST = 'api.choochoo.games'
const BASE_URL = 'https://www.choochoo.games'

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

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME ?? ''
  const password = process.env.CHOOCHOO_PASSWORD ?? ''
  if (!username || !password) {
    return Response.json({ error: 'credentials not configured' })
  }

  const base = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

  const xsrfRes = await req('GET', '/api/xsrf', base)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch {}
  const xsrfCookie = xsrfRes.cookies.map(c => c.split(';')[0]).join('; ')
  if (!xsrfToken || !xsrfCookie) {
    return Response.json({ error: `xsrf failed`, xsrfStatus: xsrfRes.status })
  }

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
  if (!myUserId) {
    return Response.json({ error: 'login failed', loginStatus: loginRes.status, loginBody: loginRes.body.slice(0, 200) })
  }
  const authCookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ') || xsrfCookie

  const attempts: any[] = []

  const endpoints = [
    // User profile endpoint
    { label: 'GET /api/users/:id', path: `/api/users/${myUserId}` },
    // User's games with various filters
    { label: 'GET /api/users/:id/games ENDED', path: `/api/users/${myUserId}/games?status[]=ENDED&pageSize=20` },
    { label: 'GET /api/users/:id/games (all)', path: `/api/users/${myUserId}/games?pageSize=10` },
    { label: 'GET /api/games?userId ENDED', path: `/api/games?userId=${myUserId}&status[]=ENDED&pageSize=20` },
    { label: 'GET /api/games?userId (all)', path: `/api/games?userId=${myUserId}&pageSize=10` },
    { label: 'GET /api/games?playerId ENDED', path: `/api/games?playerId=${myUserId}&status[]=ENDED&pageSize=20` },
    { label: 'GET /api/games?player ENDED', path: `/api/games?player=${myUserId}&status[]=ENDED&pageSize=20` },
    // ENDED with larger page to check if we'd miss games
    { label: 'GET /api/games ENDED pageSize=100', path: `/api/games?status[]=ENDED&pageSize=100` },
    // Check what total ENDED games exist
    { label: 'GET /api/games ENDED pageSize=1 (count check)', path: `/api/games?status[]=ENDED&pageSize=1` },
  ]

  for (const { label, path } of endpoints) {
    const res = await req('GET', path, { ...base, Cookie: authCookie })
    let parsed: any = null
    try { parsed = JSON.parse(res.body) } catch {}
    const games: any[] = parsed?.games ?? (Array.isArray(parsed) ? parsed : [])
    const myGames = games.filter((g: any) => Array.isArray(g.playerIds) && g.playerIds.includes(myUserId))
    const totalCount = parsed?.total ?? parsed?.count ?? parsed?.totalCount ?? null
    attempts.push({
      label,
      httpStatus: res.status,
      totalGames: games.length,
      myGames: myGames.length,
      totalCount,
      topLevelKeys: parsed ? Object.keys(parsed) : null,
      sampleGame: myGames[0] ? JSON.stringify(myGames[0]).slice(0, 400) : undefined,
      rawPreview: res.status !== 200 ? res.body.slice(0, 200) : undefined,
    })
  }

  return Response.json({ myUserId, attempts })
}
