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
    return Response.json({ error: `xsrf failed`, xsrfStatus: xsrfRes.status, xsrfBody: xsrfRes.body.slice(0, 200) })
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

  // Try both FINISHED and finished
  const attempts: any[] = []
  for (const status of ['FINISHED', 'finished', 'COMPLETED', 'completed', 'DONE', 'done']) {
    const path = `/api/games?status[]=${status}&pageSize=50`
    const gamesRes = await req('GET', path, { ...base, Cookie: authCookie })
    let gamesJson: any = {}
    try { gamesJson = JSON.parse(gamesRes.body) } catch {}
    const allGames: any[] = gamesJson.games ?? (Array.isArray(gamesJson) ? gamesJson : [])
    const myGames = allGames.filter((g: any) => Array.isArray(g.playerIds) && g.playerIds.includes(myUserId))
    attempts.push({
      status,
      httpStatus: gamesRes.status,
      totalGames: allGames.length,
      myGames: myGames.length,
      rawPreview: gamesRes.body.slice(0, 300),
    })
  }

  // Also try fetching without status filter to see all games
  const allRes = await req('GET', `/api/games?pageSize=10`, { ...base, Cookie: authCookie })
  let allJson: any = {}
  try { allJson = JSON.parse(allRes.body) } catch {}
  const allGamesRaw: any[] = allJson.games ?? []
  const uniqueStatuses = [...new Set(allGamesRaw.map((g: any) => g.status))]

  return Response.json({ myUserId, attempts, allGamesStatuses: uniqueStatuses, allGamesCount: allGamesRaw.length })
}
