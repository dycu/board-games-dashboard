import { NextResponse } from 'next/server'
import { request as httpsRequest } from 'https'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function req(method: string, path: string, headers: Record<string, string>, body?: string, timeoutMs = 20000): Promise<{ status: number; body: string; resHeaders: Record<string, string | string[]> }> {
  return new Promise((resolve) => {
    const r = httpsRequest({
      hostname: 'api.choochoo.games',
      port: 443, path, method, headers,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, (res) => {
      let data = ''
      res.on('data', (c: any) => data += c)
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: data.slice(0, 2000),
        resHeaders: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, typeof v === 'string' ? v : (v ?? [])])),
      }))
    })
    r.on('error', (e) => resolve({ status: 0, body: `ERROR: ${e.message}`, resHeaders: {} }))
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: `TIMEOUT after ${timeoutMs}ms`, resHeaders: {} }) })
    if (body) r.write(body)
    r.end()
  })
}

function getCookies(r: { resHeaders: Record<string, string | string[]> }): string[] {
  const raw = r.resHeaders['set-cookie'] ?? []
  return (Array.isArray(raw) ? raw : [raw as string]).filter(Boolean)
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const base = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

  // Step 1: fresh XSRF token + session
  const xsrfRes = await req('GET', '/api/xsrf', base)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch {}
  const xsrfCookie = getCookies(xsrfRes).map(c => c.split(';')[0]).join('; ')

  const lb = JSON.stringify({ usernameOrEmail: username, password })
  const ct = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(lb).toString() }

  // Step 2a: login without session cookie, with xsrf-token header — 20s timeout
  const loginNoCookie = await req('POST', '/users/login', {
    ...base, ...ct, 'xsrf-token': xsrfToken,
  }, lb, 20000)

  // Step 2b: login WITH session cookie + xsrf-token — 20s timeout
  const loginWithCookie = await req('POST', '/users/login', {
    ...base, ...ct, 'xsrf-token': xsrfToken, Cookie: xsrfCookie,
  }, lb, 20000)

  // Step 2c: try the /api/ prefix (since /api/ returned 401 "please log in")
  const loginApiPrefix = await req('POST', '/api/users/login', {
    ...base, ...ct, 'xsrf-token': xsrfToken, Cookie: xsrfCookie,
  }, lb, 10000)

  // Step 2d: try /api/login
  const loginApiLogin = await req('POST', '/api/login', {
    ...base, ...ct, 'xsrf-token': xsrfToken, Cookie: xsrfCookie,
  }, lb, 10000)

  const fmt = (r: typeof loginNoCookie) => ({
    status: r.status,
    body: r.body.slice(0, 500),
    cookies: getCookies(r).map(c => c.slice(0, 100)),
  })

  return NextResponse.json({
    xsrf: { status: xsrfRes.status, tokenLen: xsrfToken.length, sessionCookie: xsrfCookie.slice(0, 60) },
    login_noCookie_20s: fmt(loginNoCookie),
    login_withCookie_20s: fmt(loginWithCookie),
    login_apiPrefix: fmt(loginApiPrefix),
    login_apiLogin: fmt(loginApiLogin),
  })
}
