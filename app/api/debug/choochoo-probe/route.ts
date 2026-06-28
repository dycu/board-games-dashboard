import { NextResponse } from 'next/server'
import { request as httpsRequest } from 'https'
import { createGunzip } from 'zlib'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function req(method: string, hostname: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: string; resHeaders: Record<string, string | string[]> }> {
  return new Promise((resolve) => {
    const r = httpsRequest({ hostname, port: 443, path, method, headers, rejectUnauthorized: false, timeout: 10000 }, (res) => {
      const chunks: Buffer[] = []
      const encoding = (res.headers['content-encoding'] ?? '') as string

      const sink = encoding === 'gzip' || encoding === 'br' ? (() => {
        const gunzip = createGunzip()
        res.pipe(gunzip)
        gunzip.on('data', (c: Buffer) => chunks.push(c))
        gunzip.on('error', () => {})
        return gunzip
      })() : res

      if (encoding !== 'gzip' && encoding !== 'br') {
        res.on('data', (c: Buffer) => chunks.push(c))
      }

      const done = () => {
        const body = Buffer.concat(chunks).toString('utf8').slice(0, 2000)
        resolve({ status: res.statusCode ?? 0, body, resHeaders: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, typeof v === 'string' ? v : (v ?? [])])) })
      }

      if (encoding === 'gzip' || encoding === 'br') {
        (sink as any).on('end', done)
      } else {
        res.on('end', done)
      }
    })
    r.on('error', (e) => resolve({ status: 0, body: `ERROR: ${e.message}`, resHeaders: {} }))
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT', resHeaders: {} }) })
    if (body) r.write(body)
    r.end()
  })
}

function getCookies(r: { resHeaders: Record<string, string | string[]> }): string[] {
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

  const base = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json', 'Accept-Encoding': 'gzip' }
  const WWW = 'www.choochoo.games'
  const API = 'api.choochoo.games'

  // Step 1: get XSRF token from api subdomain
  const xsrfRes = await req('GET', API, '/api/xsrf', base)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch {}
  const xsrfCookies = getCookies(xsrfRes)
  const xsrfSession = joinCookies(xsrfCookies)

  const lb = JSON.stringify({ usernameOrEmail: username, password })
  const ct = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(lb).toString() }

  // Step 2: try login at www with different XSRF approaches
  const [loginA, loginB, loginC, loginD] = await Promise.all([
    // A: no XSRF at all
    req('POST', WWW, '/api/users/login', { ...base, ...ct }, lb),
    // B: xsrf-token header (token from api/xsrf)
    req('POST', WWW, '/api/users/login', { ...base, ...ct, 'xsrf-token': xsrfToken }, lb),
    // C: X-XSRF-TOKEN header + session from api/xsrf
    req('POST', WWW, '/api/users/login', { ...base, ...ct, 'X-XSRF-TOKEN': xsrfToken, Cookie: xsrfSession }, lb),
    // D: xsrf-token header + session cookie
    req('POST', WWW, '/api/users/login', { ...base, ...ct, 'xsrf-token': xsrfToken, Cookie: xsrfSession }, lb),
  ])

  // Step 3: also try getting XSRF from www itself
  const wwwXsrf = await req('GET', WWW, '/api/xsrf', base)
  let wwwXsrfToken = ''
  try { wwwXsrfToken = JSON.parse(wwwXsrf.body).xsrfToken ?? '' } catch {}
  const wwwXsrfCookies = getCookies(wwwXsrf)
  const wwwSession = joinCookies(wwwXsrfCookies)

  const loginE = await req('POST', WWW, '/api/users/login', {
    ...base, ...ct, 'xsrf-token': wwwXsrfToken, Cookie: wwwSession,
  }, lb)

  const fmt = (r: typeof loginA) => ({
    status: r.status,
    body: r.body.slice(0, 400),
    cookies: getCookies(r).map(c => c.slice(0, 100)),
  })

  return NextResponse.json({
    xsrf_from_api: { status: xsrfRes.status, tokenLen: xsrfToken.length, cookies: xsrfCookies.map(c => c.slice(0, 80)) },
    xsrf_from_www: { status: wwwXsrf.status, tokenLen: wwwXsrfToken.length, cookies: wwwXsrfCookies.map(c => c.slice(0, 80)) },
    login_www: {
      A_noXsrf: fmt(loginA),
      B_xsrfTokenHeader: fmt(loginB),
      C_XxsrfTokenWithSession: fmt(loginC),
      D_xsrfTokenWithSession: fmt(loginD),
      E_wwwXsrfWithWwwSession: fmt(loginE),
    },
  })
}
