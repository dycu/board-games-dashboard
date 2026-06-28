import { NextResponse } from 'next/server'
import { request as httpsRequest, get as httpsGet } from 'https'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function req(method: string, hostname: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: string; resHeaders: Record<string, string | string[]> }> {
  return new Promise((resolve) => {
    const r = httpsRequest({ hostname, port: 443, path, method, headers, rejectUnauthorized: false, timeout: 8000 }, (res) => {
      let data = ''
      res.on('data', (c: any) => data += c)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data.slice(0, 800), resHeaders: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, typeof v === 'string' ? v : (v ?? [])])) }))
    })
    r.on('error', (e) => resolve({ status: 0, body: `ERROR: ${e.message}`, resHeaders: {} }))
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT', resHeaders: {} }) })
    if (body) r.write(body)
    r.end()
  })
}

function cookies(r: { resHeaders: Record<string, string | string[]> }): string[] {
  const raw = r.resHeaders['set-cookie'] ?? []
  return (Array.isArray(raw) ? raw : [raw as string]).filter(Boolean)
}

function joinCookies(list: string[]): string {
  return list.map(c => c.split(';')[0]).filter(Boolean).join('; ')
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const base = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
  const API = 'api.choochoo.games'
  const lb = JSON.stringify({ usernameOrEmail: username, password })
  const ct = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(lb).toString() }

  // Step 1: get XSRF token + session cookie
  const xsrfRes = await req('GET', API, '/api/xsrf', base)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch {}
  const xsrfCookies = cookies(xsrfRes)
  const sessionCookie = joinCookies(xsrfCookies)

  // Step 2: probe what URL paths exist on the API (GET to see route list hints)
  const [rootRes, apiRoot, v1Root, authRoot] = await Promise.all([
    req('GET', API, '/', base),
    req('GET', API, '/api/', base),
    req('GET', API, '/v1/', base),
    req('GET', API, '/auth/', base),
  ])

  // Step 3: try login at multiple URL paths, WITH session cookie + xsrf token header
  const loginHeaders = { ...base, ...ct, 'xsrf-token': xsrfToken, Cookie: sessionCookie }
  const [l1, l2, l3, l4, l5] = await Promise.all([
    req('POST', API, '/users/login', { ...base, ...ct, 'xsrf-token': xsrfToken }),                              // no cookie
    req('POST', API, '/users/login', loginHeaders),                                                              // with cookie
    req('POST', API, '/api/users/login', loginHeaders),                                                          // /api/users/login
    req('POST', API, '/auth/login', loginHeaders),                                                               // /auth/login
    req('POST', API, '/api/auth/login', loginHeaders),                                                           // /api/auth/login
  ])

  // Step 4: try the www hostname for login
  const wwwLogin = await req('POST', 'www.choochoo.games', '/api/users/login', loginHeaders)

  return NextResponse.json({
    xsrf: { status: xsrfRes.status, tokenLen: xsrfToken.length, cookies: xsrfCookies.map(c => c.slice(0, 80)) },
    routeProbe: {
      '/': rootRes.status,
      '/api/': { status: apiRoot.status, body: apiRoot.body.slice(0, 100) },
      '/v1/': v1Root.status,
      '/auth/': authRoot.status,
    },
    loginPaths: {
      'POST /users/login (no cookie)': { status: l1.status, body: l1.body.slice(0, 150) },
      'POST /users/login (with cookie)': { status: l2.status, body: l2.body.slice(0, 150) },
      'POST /api/users/login': { status: l3.status, body: l3.body.slice(0, 150) },
      'POST /auth/login': { status: l4.status, body: l4.body.slice(0, 150) },
      'POST /api/auth/login': { status: l5.status, body: l5.body.slice(0, 150) },
      'POST www/api/users/login': { status: wwwLogin.status, body: wwwLogin.body.slice(0, 150) },
    },
  })
}
