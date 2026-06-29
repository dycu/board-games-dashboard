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
  if (!xsrfToken || !xsrfCookie) return Response.json({ error: 'xsrf failed' })

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
  if (!myUserId) return Response.json({ error: 'login failed' })
  const authCookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ') || xsrfCookie

  // Fetch ended games using userId filter (correct approach)
  const endedRes = await req('GET', `/api/games?userId=${myUserId}&status[]=ENDED&pageSize=20`, { ...base, Cookie: authCookie })
  let endedJson: any = {}
  try { endedJson = JSON.parse(endedRes.body) } catch {}
  const endedGames: any[] = endedJson.games ?? []

  // Get full detail of first ended game to see all available fields (including dates)
  let firstGameDetail: any = null
  if (endedGames.length > 0) {
    const detailRes = await req('GET', `/api/games/${endedGames[0].id}`, { ...base, Cookie: authCookie })
    try { firstGameDetail = JSON.parse(detailRes.body) } catch {}
  }

  // Check if there are more pages
  const nextCursor = endedJson.nextPageCursor ?? null

  // Also fetch page 2 if cursor exists
  let page2Games: any[] = []
  if (nextCursor) {
    const page2Res = await req('GET', `/api/games?userId=${myUserId}&status[]=ENDED&pageSize=20&cursor=${nextCursor}`, { ...base, Cookie: authCookie })
    let page2Json: any = {}
    try { page2Json = JSON.parse(page2Res.body) } catch {}
    page2Games = page2Json.games ?? []
  }

  return Response.json({
    myUserId,
    endedGames: {
      httpStatus: endedRes.status,
      count: endedGames.length,
      nextPageCursor: nextCursor,
      // Show full first game object to see all available fields
      firstGameFull: endedGames[0] ?? null,
      firstGameDetailFull: firstGameDetail,
      page2Count: page2Games.length,
      page2FirstGame: page2Games[0] ?? null,
    },
  })
}
