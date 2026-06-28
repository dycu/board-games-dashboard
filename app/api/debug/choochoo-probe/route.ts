import { NextResponse } from 'next/server'
import { request as httpsRequest } from 'https'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
// Node.js runtime so we can use https module with rejectUnauthorized

function httpsReq(method: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: string; cookies: string }> {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'api.choochoo.games',
      port: 443,
      path,
      method,
      headers,
      rejectUnauthorized: false, // probe-only: bypass TLS cert chain issue
      timeout: 10000,
    }
    const req = httpsRequest(opts, (res) => {
      let data = ''
      res.on('data', (chunk: any) => data += chunk)
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: data.slice(0, 600),
        cookies: (res.headers['set-cookie'] ?? []).join('; ').slice(0, 80),
      }))
    })
    req.on('error', (e) => resolve({ status: 0, body: `ERROR: ${e.message}`, cookies: '' }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'TIMEOUT', cookies: '' }) })
    if (body) req.write(body)
    req.end()
  })
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const loginBody = JSON.stringify({ usernameOrEmail: username, password })
  const loginHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0',
    'Content-Length': Buffer.byteLength(loginBody).toString(),
  }

  const [ping, login] = await Promise.all([
    httpsReq('GET', '/', { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' }),
    httpsReq('POST', '/users/login', loginHeaders, loginBody),
  ])

  if (login.status >= 400 || login.status === 0 || !login.cookies) {
    return NextResponse.json({ ping, login })
  }

  const sessionCookie = login.cookies.split(';')[0]
  const authHeaders = { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0', Cookie: sessionCookie }

  const [me, games] = await Promise.all([
    httpsReq('GET', '/users/me', authHeaders),
    httpsReq('GET', '/games?status[]=ACTIVE&pageSize=20', authHeaders),
  ])

  let meJson: any, gamesJson: any
  try { meJson = JSON.parse(me.body) } catch { meJson = null }
  try { gamesJson = JSON.parse(games.body) } catch { gamesJson = null }
  const gameList: any[] = gamesJson?.games ?? []

  return NextResponse.json({
    ping: { status: ping.status, body: ping.body.slice(0, 100) },
    loginStatus: login.status,
    sessionCookie: sessionCookie.slice(0, 40),
    myUserId: meJson?.user?.id,
    myUsername: meJson?.user?.username,
    gamesStatus: games.status,
    gameCount: gameList.length,
    firstGameKeys: gameList[0] ? Object.keys(gameList[0]) : [],
    gameSamples: gameList.slice(0, 2),
  })
}
