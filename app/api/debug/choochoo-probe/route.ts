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

function getCookies(r: { resHeaders: Record<string, string | string[]> }): string[] {
  const raw = r.resHeaders['set-cookie'] ?? []
  return (Array.isArray(raw) ? raw : [raw as string]).filter(Boolean)
}

function joinCookies(cookies: string[]): string {
  return cookies.map(c => c.split(';')[0]).filter(Boolean).join('; ')
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const base = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
  const loginBodyStr = JSON.stringify({ usernameOrEmail: username, password })
  const ct = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBodyStr).toString() }

  // ── Approach A: xsrf-first (current assumption) ──────────────────────────
  // GET /api/xsrf (no session) → try login with that token
  const xsrfA = await httpsReq('GET', '/api/xsrf', base)
  let tokenA = ''
  try { tokenA = JSON.parse(xsrfA.body).xsrfToken ?? '' } catch {}

  const loginA = await httpsReq('POST', '/users/login', {
    ...base, ...ct, 'xsrf-token': tokenA,
  }, loginBodyStr)

  // ── Approach B: session-first ─────────────────────────────────────────────
  // Step 1: GET /api/xsrf with no session → get whatever session the server sets
  const xsrfB1 = await httpsReq('GET', '/api/xsrf', base)
  const sessionFromXsrf = joinCookies(getCookies(xsrfB1))
  let tokenB1 = ''
  try { tokenB1 = JSON.parse(xsrfB1.body).xsrfToken ?? '' } catch {}

  // Step 2: GET /api/xsrf again, but WITH the session cookie from step 1
  const xsrfB2 = await httpsReq('GET', '/api/xsrf', { ...base, ...(sessionFromXsrf ? { Cookie: sessionFromXsrf } : {}) })
  let tokenB2 = ''
  try { tokenB2 = JSON.parse(xsrfB2.body).xsrfToken ?? '' } catch {}
  const sessionFromXsrf2 = joinCookies([...getCookies(xsrfB1), ...getCookies(xsrfB2)])

  // Step 3: login with session + token from step 2
  const loginB = await httpsReq('POST', '/users/login', {
    ...base, ...ct, 'xsrf-token': tokenB2,
    ...(sessionFromXsrf2 ? { Cookie: sessionFromXsrf2 } : {}),
  }, loginBodyStr)

  // ── Approach C: failed-login-first, then xsrf ────────────────────────────
  // Some apps issue a session on the first (failed) request
  const loginC1 = await httpsReq('POST', '/users/login', { ...base, ...ct }, loginBodyStr)
  const sessionC = joinCookies(getCookies(loginC1))

  // GET /api/xsrf WITH that session
  const xsrfC = await httpsReq('GET', '/api/xsrf', { ...base, ...(sessionC ? { Cookie: sessionC } : {}) })
  let tokenC = ''
  try { tokenC = JSON.parse(xsrfC.body).xsrfToken ?? '' } catch {}
  const allCookiesC = joinCookies([...getCookies(loginC1), ...getCookies(xsrfC)])

  // Login with session + new xsrf token
  const loginC2 = await httpsReq('POST', '/users/login', {
    ...base, ...ct, 'xsrf-token': tokenC,
    ...(allCookiesC ? { Cookie: allCookiesC } : {}),
  }, loginBodyStr)

  const fmt = (r: typeof loginA) => ({ status: r.status, body: r.body.slice(0, 300) })

  return NextResponse.json({
    approachA_xsrfFirst: {
      xsrfStatus: xsrfA.status, tokenLength: tokenA.length,
      loginResult: fmt(loginA),
    },
    approachB_sessionThenFreshXsrf: {
      step1_xsrfCookies: getCookies(xsrfB1).map(c => c.slice(0, 80)),
      step2_token: tokenB2.slice(0, 16) + '...', step2_sameAsStep1: tokenB1 === tokenB2,
      loginResult: fmt(loginB),
    },
    approachC_failedLoginThenXsrf: {
      step1_loginStatus: loginC1.status,
      step1_cookies: getCookies(loginC1).map(c => c.slice(0, 80)),
      step2_xsrfStatus: xsrfC.status, step2_token: tokenC.slice(0, 16) + '...',
      loginResult: fmt(loginC2),
    },
  })
}
