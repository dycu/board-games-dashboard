import { NextResponse } from 'next/server'
import { request as httpsRequest } from 'https'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function httpsReq(method: string, hostname: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: string; resHeaders: Record<string, string | string[]> }> {
  return new Promise((resolve) => {
    const req = httpsRequest({
      hostname,
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

function extractCookies(r: { resHeaders: Record<string, string | string[]> }): string[] {
  const raw = r.resHeaders['set-cookie'] ?? []
  return Array.isArray(raw) ? raw : [raw as string]
}

function findXsrf(cookies: string[]): string {
  const xsrfCookie = cookies.find(c => c.toLowerCase().startsWith('xsrf-token=') || c.toLowerCase().startsWith('csrf='))
  if (xsrfCookie) return xsrfCookie.split(';')[0].split('=').slice(1).join('=')
  return ''
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const baseHeaders = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
  const API = 'api.choochoo.games'
  const WWW = 'www.choochoo.games'

  // Step 1: Probe various paths on both api and www for XSRF token
  const [
    apiRoot, apiXsrf, apiApiXsrf, apiCsrf, apiAuthXsrf, apiAuthCsrf, apiV1Xsrf,
    wwwRoot, wwwLogin,
  ] = await Promise.all([
    httpsReq('GET', API, '/', baseHeaders),
    httpsReq('GET', API, '/xsrf', baseHeaders),
    httpsReq('GET', API, '/api/xsrf', baseHeaders),
    httpsReq('GET', API, '/csrf', baseHeaders),
    httpsReq('GET', API, '/auth/xsrf', baseHeaders),
    httpsReq('GET', API, '/auth/csrf', baseHeaders),
    httpsReq('GET', API, '/v1/xsrf', baseHeaders),
    httpsReq('GET', WWW, '/', { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }),
    httpsReq('GET', WWW, '/login', { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }),
  ])

  // Collect ALL cookies set by root/login page requests
  const wwwRootCookies = extractCookies(wwwRoot)
  const wwwLoginCookies = extractCookies(wwwLogin)
  const apiRootCookies = extractCookies(apiRoot)

  // Extract XSRF-TOKEN from www main page cookies
  const xsrfFromWwwRoot = findXsrf(wwwRootCookies)
  const xsrfFromWwwLogin = findXsrf(wwwLoginCookies)

  // Also look for XSRF token in www page HTML (embedded in script or meta)
  const wwwRootBody = wwwRoot.body
  const xsrfInHtml = wwwRootBody.match(/xsrf[_-]?token['":\s]+([a-zA-Z0-9._-]{20,})/i)?.[1] ?? ''

  // Step 2: Try login using XSRF from www cookies and all cookies as Cookie header
  const allWwwCookies = [...wwwRootCookies, ...wwwLoginCookies]
    .map(c => c.split(';')[0])
    .filter(Boolean)
    .join('; ')

  const loginBody = JSON.stringify({ usernameOrEmail: username, password })
  const loginHeaders = {
    ...baseHeaders,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginBody).toString(),
  }

  // Try login with XSRF-TOKEN cookie value as xsrf-token header
  const loginWithWwwXsrf = xsrfFromWwwRoot ? await httpsReq('POST', API, '/users/login', {
    ...loginHeaders,
    Cookie: allWwwCookies,
    'xsrf-token': xsrfFromWwwRoot,
    'X-XSRF-TOKEN': xsrfFromWwwRoot,
  }, loginBody) : null

  // Step 3: Try plain login and inspect ALL cookies set in response
  const loginPlain = await httpsReq('POST', API, '/users/login', loginHeaders, loginBody)
  const loginPlainCookies = extractCookies(loginPlain)
  const xsrfFromLoginResponse = findXsrf(loginPlainCookies)

  // Step 4: If login response set an XSRF cookie, retry with it
  const connectSid = loginPlainCookies.find(c => c.includes('connect.sid'))?.split(';')[0] ?? ''
  const loginRetry = xsrfFromLoginResponse || connectSid ? await httpsReq('POST', API, '/users/login', {
    ...loginHeaders,
    Cookie: connectSid,
    'xsrf-token': xsrfFromLoginResponse || connectSid.split('=').slice(1).join('='),
    'X-XSRF-TOKEN': xsrfFromLoginResponse || connectSid.split('=').slice(1).join('='),
  }, loginBody) : null

  return NextResponse.json({
    apiEndpoints: {
      'GET /': { status: apiRoot.status, body: apiRoot.body.slice(0, 100), cookies: apiRootCookies.map(c => c.slice(0, 80)) },
      'GET /xsrf': { status: apiXsrf.status, body: apiXsrf.body.slice(0, 100) },
      'GET /api/xsrf': { status: apiApiXsrf.status, body: apiApiXsrf.body.slice(0, 100) },
      'GET /csrf': { status: apiCsrf.status, body: apiCsrf.body.slice(0, 100) },
      'GET /auth/xsrf': { status: apiAuthXsrf.status, body: apiAuthXsrf.body.slice(0, 100) },
      'GET /auth/csrf': { status: apiAuthCsrf.status, body: apiAuthCsrf.body.slice(0, 100) },
      'GET /v1/xsrf': { status: apiV1Xsrf.status, body: apiV1Xsrf.body.slice(0, 100) },
    },
    wwwEndpoints: {
      'GET /': { status: wwwRoot.status, cookies: wwwRootCookies.map(c => c.slice(0, 120)), xsrfFound: xsrfFromWwwRoot, xsrfInHtml: xsrfInHtml.slice(0, 80) },
      'GET /login': { status: wwwLogin.status, cookies: wwwLoginCookies.map(c => c.slice(0, 120)), xsrfFound: xsrfFromWwwLogin },
    },
    loginAttempts: {
      withWwwXsrf: loginWithWwwXsrf ? { status: loginWithWwwXsrf.status, body: loginWithWwwXsrf.body.slice(0, 200) } : 'skipped (no XSRF from www)',
      plainCookies: loginPlainCookies.map(c => c.slice(0, 120)),
      xsrfFromLoginResponse,
      retry: loginRetry ? { status: loginRetry.status, body: loginRetry.body.slice(0, 200) } : 'skipped',
    },
  })
}
