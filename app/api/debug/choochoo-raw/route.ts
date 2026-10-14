import { request as httpsRequest } from 'https'

const API_HOST = 'api.choochoo.games'

function req(method: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: string; cookies: string[] }> {
  return new Promise((resolve) => {
    const r = httpsRequest({ hostname: API_HOST, port: 443, path, method, headers, rejectUnauthorized: false, timeout: 15000 }, (res) => {
      let data = ''
      res.on('data', (c: Buffer) => { data += c })
      const cookies = (res.headers['set-cookie'] ?? []) as string[]
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data, cookies }))
    })
    r.on('error', (e) => resolve({ status: 0, body: `ERROR: ${e.message}`, cookies: [] }))
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT', cookies: [] }) })
    if (body) r.write(body)
    r.end()
  })
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME ?? ''
  const password = process.env.CHOOCHOO_PASSWORD ?? ''
  const base = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

  const xsrfRes = await req('GET', '/api/xsrf', base)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch { /* ignore */ }
  const xsrfCookie = xsrfRes.cookies.map(c => c.split(';')[0]).join('; ')

  const loginBody = JSON.stringify({ usernameOrEmail: username, password })
  const loginRes = await req('POST', '/api/users/login', {
    ...base, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody).toString(),
    'xsrf-token': xsrfToken, Cookie: xsrfCookie,
  }, loginBody)
  let loginJson: any = {}
  try { loginJson = JSON.parse(loginRes.body) } catch { /* ignore */ }
  const myUserId: number = loginJson?.user?.id
  if (!myUserId) return Response.json({ error: 'login failed', loginRes })
  const authCookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ') || xsrfCookie

  const gamesRes = await req('GET', `/api/games?status[]=ACTIVE&userId=${myUserId}`, { ...base, Cookie: authCookie })
  let gamesJson: any = {}
  try { gamesJson = JSON.parse(gamesRes.body) } catch { /* ignore */ }
  const allGames: any[] = gamesJson.games ?? (Array.isArray(gamesJson) ? gamesJson : [])
  const myGames = allGames.filter((g: any) => Array.isArray(g.playerIds) && g.playerIds.includes(myUserId))

  // Try a per-game detail endpoint too, in case the list is a summary
  let detail: any = null
  if (myGames[0]) {
    const detailRes = await req('GET', `/api/games/${myGames[0].id}`, { ...base, Cookie: authCookie })
    try { detail = JSON.parse(detailRes.body) } catch { detail = { raw: detailRes.body.slice(0, 500), status: detailRes.status } }
  }

  return Response.json({
    activeCount: myGames.length,
    firstGame: myGames[0] ?? null,
    firstGameKeys: myGames[0] ? Object.keys(myGames[0]) : [],
    detail,
    detailKeys: detail && typeof detail === 'object' ? Object.keys(detail) : null,
  })
}
