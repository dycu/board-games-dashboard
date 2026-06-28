import { NextResponse } from 'next/server'
import { request as httpsRequest } from 'https'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function httpsReq(method: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: string; resHeaders: Record<string, string | string[]> }> {
  return new Promise((resolve) => {
    const req = httpsRequest({
      hostname: 'api.choochoo.games',
      port: 443,
      path,
      method,
      headers,
      rejectUnauthorized: false,
      timeout: 10000,
    }, (res) => {
      let data = ''
      res.on('data', (chunk: any) => data += chunk)
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: data.slice(0, 2000),
        resHeaders: Object.fromEntries(
          Object.entries(res.headers).map(([k, v]) => [k, typeof v === 'string' ? v : (v ?? [])])
        ),
      }))
    })
    req.on('error', (e) => resolve({ status: 0, body: `ERROR: ${e.message}`, resHeaders: {} }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'TIMEOUT', resHeaders: {} }) })
    if (body) req.write(body)
    req.end()
  })
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const baseHeaders = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

  // Step 1: get XSRF token
  const xsrfRes = await httpsReq('GET', '/api/xsrf', baseHeaders)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch {}
  const xsrfCookies: string[] = Array.isArray(xsrfRes.resHeaders['set-cookie'])
    ? xsrfRes.resHeaders['set-cookie'] as string[]
    : (xsrfRes.resHeaders['set-cookie'] ? [xsrfRes.resHeaders['set-cookie'] as string] : [])

  // Step 2: login using the XSRF token from body
  const loginBody = JSON.stringify({ usernameOrEmail: username, password })
  const loginRes = await httpsReq('POST', '/users/login', {
    ...baseHeaders,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginBody).toString(),
    'xsrf-token': xsrfToken,
  }, loginBody)

  const loginCookies: string[] = Array.isArray(loginRes.resHeaders['set-cookie'])
    ? loginRes.resHeaders['set-cookie'] as string[]
    : (loginRes.resHeaders['set-cookie'] ? [loginRes.resHeaders['set-cookie'] as string] : [])

  const authCookie = loginCookies.find(c => c.includes('connect.sid'))?.split(';')[0] ?? ''

  let loginJson: any = null
  try { loginJson = JSON.parse(loginRes.body) } catch {}

  // Step 3: if login succeeded, fetch games
  let gamesResult: any = 'skipped (login failed)'
  if (loginJson?.user?.id && authCookie) {
    const userId = loginJson.user.id
    const gamesRes = await httpsReq('GET', `/games?userId=${userId}&status[]=ACTIVE&pageSize=20`, {
      ...baseHeaders,
      Cookie: authCookie,
    })
    try { gamesResult = JSON.parse(gamesRes.body) } catch { gamesResult = { status: gamesRes.status, raw: gamesRes.body.slice(0, 500) } }
  }

  return NextResponse.json({
    step1_xsrf: {
      status: xsrfRes.status,
      token: xsrfToken,
      tokenLength: xsrfToken.length,
      cookies: xsrfCookies.map(c => c.slice(0, 100)),
    },
    step2_login: {
      status: loginRes.status,
      body: loginRes.body.slice(0, 500),
      cookies: loginCookies.map(c => c.slice(0, 120)),
      userId: loginJson?.user?.id ?? null,
    },
    step3_games: gamesResult,
  })
}
