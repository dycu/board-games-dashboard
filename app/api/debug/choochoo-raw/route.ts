import { request as httpsRequest } from 'https'

// Temporary: inspect the raw choochoo.games GET /api/users/:id response for
// an avatar/image field — app/api/choochoo/route.ts only reads `username`
// off it today. Delete after use.
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
  const xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? ''
  const xsrfCookie = xsrfRes.cookies.map(c => c.split(';')[0]).join('; ')

  const loginBody = JSON.stringify({ usernameOrEmail: username, password })
  const loginRes = await req('POST', '/api/users/login', {
    ...base, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody).toString(),
    'xsrf-token': xsrfToken, Cookie: xsrfCookie,
  }, loginBody)
  const loginJson = JSON.parse(loginRes.body)
  const myUserId = loginJson?.user?.id
  const authCookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ') || xsrfCookie

  const gamesRes = await req('GET', `/api/games?status[]=ACTIVE&userId=${myUserId}`, { ...base, Cookie: authCookie })
  const gamesJson = JSON.parse(gamesRes.body)
  const allGames: any[] = gamesJson.games ?? (Array.isArray(gamesJson) ? gamesJson : [])
  const otherId = allGames.flatMap((g: any) => g.playerIds ?? []).find((id: number) => id !== myUserId)

  const myOwnRes = await req('GET', `/api/users/${myUserId}`, { ...base, Cookie: authCookie })
  const otherRes = otherId ? await req('GET', `/api/users/${otherId}`, { ...base, Cookie: authCookie }) : null

  return Response.json({ myUser: JSON.parse(myOwnRes.body), otherUser: otherRes ? JSON.parse(otherRes.body) : null })
}
