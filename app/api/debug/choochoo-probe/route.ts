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
        body: data.slice(0, 1000),
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

function loginBody(username: string, password: string, extra: object = {}) {
  const b = JSON.stringify({ usernameOrEmail: username, password, ...extra })
  return { body: b, len: Buffer.byteLength(b).toString() }
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const base = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

  // Step 1: get XSRF token
  const xsrfRes = await httpsReq('GET', '/api/xsrf', base)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch {}

  // Try 6 login variants in parallel, each with a different XSRF delivery method
  const { body: lb, len } = loginBody(username, password)
  const ct = { 'Content-Type': 'application/json', 'Content-Length': len }

  const [v1, v2, v3, v4, v5, v6] = await Promise.all([
    // v1: xsrf-token header (current approach)
    httpsReq('POST', '/users/login', { ...base, ...ct, 'xsrf-token': xsrfToken }, lb),
    // v2: X-XSRF-TOKEN header (Angular convention)
    httpsReq('POST', '/users/login', { ...base, ...ct, 'X-XSRF-TOKEN': xsrfToken }, lb),
    // v3: X-CSRF-TOKEN header (Rails/Django convention)
    httpsReq('POST', '/users/login', { ...base, ...ct, 'X-CSRF-TOKEN': xsrfToken }, lb),
    // v4: xsrf-token header + XSRF-TOKEN cookie (double-submit cookie pattern)
    httpsReq('POST', '/users/login', { ...base, ...ct, 'xsrf-token': xsrfToken, Cookie: `XSRF-TOKEN=${xsrfToken}` }, lb),
    // v5: X-XSRF-TOKEN header + XSRF-TOKEN cookie
    httpsReq('POST', '/users/login', { ...base, ...ct, 'X-XSRF-TOKEN': xsrfToken, Cookie: `XSRF-TOKEN=${xsrfToken}` }, lb),
    // v6: xsrfToken in body
    (() => { const { body: b2, len: l2 } = loginBody(username, password, { xsrfToken }); return httpsReq('POST', '/users/login', { ...base, 'Content-Type': 'application/json', 'Content-Length': l2 }, b2) })(),
  ])

  const fmt = (r: typeof v1) => ({ status: r.status, body: r.body.slice(0, 200) })

  // Check if any variant succeeded
  const variants = { v1_xsrfTokenHeader: fmt(v1), v2_XxsrfTokenHeader: fmt(v2), v3_XcsrfTokenHeader: fmt(v3), v4_doubleSubmitXsrf: fmt(v4), v5_doubleSubmitXXsrf: fmt(v5), v6_inBody: fmt(v6) }
  const winner = Object.entries(variants).find(([, r]) => r.status === 200)

  return NextResponse.json({
    xsrfToken: xsrfToken.slice(0, 16) + '...',
    variants,
    winner: winner ? winner[0] : 'none — all failed',
  })
}
