import { NextResponse } from 'next/server'
import { request as httpsRequest } from 'https'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function req(method: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: string; resHeaders: Record<string, string | string[]> }> {
  return new Promise((resolve) => {
    const r = httpsRequest({
      hostname: 'api.choochoo.games',
      port: 443, path, method, headers,
      rejectUnauthorized: false, timeout: 15000,
    }, (res) => {
      let data = ''
      res.on('data', (c: any) => data += c)
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: data.slice(0, 5000),
        resHeaders: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, typeof v === 'string' ? v : (v ?? [])])),
      }))
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

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const base = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

  // Step 1: XSRF
  const xsrfRes = await req('GET', '/api/xsrf', base)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch {}
  const xsrfCookie = getCookies(xsrfRes).map(c => c.split(';')[0]).join('; ')

  // Step 2: login
  const lb = JSON.stringify({ usernameOrEmail: username, password })
  const ct = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(lb).toString() }
  const loginRes = await req('POST', '/api/users/login', {
    ...base, ...ct, 'xsrf-token': xsrfToken, Cookie: xsrfCookie,
  }, lb)
  let loginJson: any = null
  try { loginJson = JSON.parse(loginRes.body) } catch {}
  const authCookie = getCookies(loginRes).map(c => c.split(';')[0]).join('; ') || xsrfCookie
  const userId = loginJson?.user?.id

  if (!userId) {
    return NextResponse.json({ error: 'login failed', loginStatus: loginRes.status, loginBody: loginRes.body })
  }

  // Step 3: probe games endpoint variants to understand structure
  const [g1, g2, g3, g4, g5] = await Promise.all([
    req('GET', '/api/games', { ...base, Cookie: authCookie }),
    req('GET', `/api/games?status[]=ACTIVE&pageSize=20`, { ...base, Cookie: authCookie }),
    req('GET', `/api/games?userId=${userId}&status[]=ACTIVE&pageSize=20`, { ...base, Cookie: authCookie }),
    req('GET', `/api/games?status=ACTIVE&pageSize=20`, { ...base, Cookie: authCookie }),
    req('GET', `/api/games?pageSize=20`, { ...base, Cookie: authCookie }),
  ])

  return NextResponse.json({
    userId,
    authCookiePreview: authCookie.slice(0, 60),
    games: {
      'no params': { status: g1.status, body: g1.body },
      'status[]=ACTIVE&pageSize=20': { status: g2.status, body: g2.body.slice(0, 1000) },
      'userId+status[]=ACTIVE&pageSize=20': { status: g3.status, body: g3.body.slice(0, 500) },
      'status=ACTIVE&pageSize=20': { status: g4.status, body: g4.body.slice(0, 1000) },
      'pageSize=20': { status: g5.status, body: g5.body.slice(0, 1000) },
    },
  })
}
