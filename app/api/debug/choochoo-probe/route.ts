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
        body: data.slice(0, 800),
        resHeaders: Object.fromEntries(
          Object.entries(res.headers).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 100) : (v ?? []).map((s: string) => s.slice(0, 100))])
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

  // Step 1: try various GET endpoints to get XSRF cookie/token
  const [xsrfRes, usersRes, meRes] = await Promise.all([
    httpsReq('GET', '/xsrf', baseHeaders),
    httpsReq('GET', '/users/', baseHeaders),
    httpsReq('GET', '/users/me', baseHeaders),
  ])

  // Extract XSRF from cookies
  const extractXsrf = (r: typeof xsrfRes) => {
    const setCookie: any = r.resHeaders['set-cookie'] ?? []
    const cookies: string[] = Array.isArray(setCookie) ? setCookie : [setCookie]
    const xsrfCookie = cookies.find((c: string) => c.toLowerCase().includes('xsrf') || c.toLowerCase().includes('csrf'))
    let token = ''
    try { token = JSON.parse(r.body).xsrfToken ?? JSON.parse(r.body).csrfToken ?? '' } catch {}
    return { setCookie: cookies.map(c => c.slice(0, 80)), xsrfCookie: xsrfCookie?.slice(0, 80), bodyToken: token }
  }

  const xsrfInfo = {
    '/xsrf': { status: xsrfRes.status, body: xsrfRes.body.slice(0, 100), ...extractXsrf(xsrfRes) },
    '/users/': { status: usersRes.status, body: usersRes.body.slice(0, 100), ...extractXsrf(usersRes) },
    '/users/me': { status: meRes.status, body: meRes.body.slice(0, 100), ...extractXsrf(meRes) },
  }

  // Step 2: try login without XSRF first, see what cookies come back
  const loginNoXsrf = await httpsReq('POST', '/users/login', {
    ...baseHeaders,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(JSON.stringify({ usernameOrEmail: username, password })).toString(),
  }, JSON.stringify({ usernameOrEmail: username, password }))

  // Step 3: try login with XSRF from connect.sid cookie
  const setCookieHeader = loginNoXsrf.resHeaders['set-cookie']
  const setCookieList: string[] = Array.isArray(setCookieHeader) ? setCookieHeader : (setCookieHeader ? [setCookieHeader as string] : [])
  const connectSid = setCookieList.find((c: string) => c.includes('connect.sid')) ?? ''
  const sessionCookieVal = connectSid.split(';')[0]

  // Step 4: check if there's a double-submit pattern (send sid as xsrf token)
  const loginWithSid = sessionCookieVal ? await httpsReq('POST', '/users/login', {
    ...baseHeaders,
    'Content-Type': 'application/json',
    'X-XSRF-TOKEN': sessionCookieVal.split('=')[1] ?? '',
    Cookie: sessionCookieVal,
    'Content-Length': Buffer.byteLength(JSON.stringify({ usernameOrEmail: username, password })).toString(),
  }, JSON.stringify({ usernameOrEmail: username, password })) : null

  return NextResponse.json({
    xsrfInfo,
    loginNoXsrf: { status: loginNoXsrf.status, body: loginNoXsrf.body.slice(0, 200), setCookie: loginNoXsrf.resHeaders['set-cookie'] },
    loginWithSid: loginWithSid ? { status: loginWithSid.status, body: loginWithSid.body.slice(0, 200) } : 'skipped',
  })
}
