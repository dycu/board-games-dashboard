import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BASE = 'https://boardgamearena.com'
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

function parseCookies(headers: Headers): Record<string, string> {
  const cookies: Record<string, string> = {}
  const list = headers.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : [])
  for (const raw of list) {
    const [kv] = raw.split(';')
    const eq = kv.indexOf('=')
    if (eq > 0) cookies[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim()
  }
  return cookies
}
function cookieString(c: Record<string, string>) { return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ') }
function extractRequestToken(html: string): string {
  const m = html.match(/g_requestToken\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/['"]request_token['"]\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
  return m ? m[m.length - 1] : ''
}

export async function GET() {
  const username = process.env.BGA_USERNAME
  const password = process.env.BGA_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const log: string[] = []
  try {
    // Login (same as bga connector)
    const initRes = await fetch(`${BASE}/account`, { redirect: 'manual', headers: { ...BROWSER_HEADERS, Accept: 'text/html,*/*' } })
    let cookies = parseCookies(initRes.headers)
    let loginBase = BASE
    if (initRes.status >= 300 && initRes.status < 400) {
      const location = initRes.headers.get('location') ?? ''
      if (location) {
        const url = new URL(location.startsWith('http') ? location : `${BASE}${location}`)
        loginBase = url.origin
        const followRes = await fetch(url.href, { redirect: 'manual', headers: { ...BROWSER_HEADERS, Accept: 'text/html,*/*', Cookie: cookieString(cookies) } })
        cookies = { ...cookies, ...parseCookies(followRes.headers) }
      }
    }
    const loginPageRes = await fetch(`${loginBase}/?page=login`, { headers: { ...BROWSER_HEADERS, Accept: 'text/html,*/*', Cookie: cookieString(cookies) } })
    cookies = { ...cookies, ...parseCookies(loginPageRes.headers) }
    const requestToken = extractRequestToken(await loginPageRes.text())
    if (!requestToken) return NextResponse.json({ error: 'no request_token', log }, { status: 500 })

    const loginRes = await fetch(`${loginBase}/account/auth/loginUserWithPassword.html`, {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', 'X-Request-Token': requestToken, Origin: loginBase, Referer: `${loginBase}/?step=2&page=login`, Cookie: cookieString(cookies) },
      body: new URLSearchParams({ username, password, remember_me: 'true', request_token: requestToken }),
    })
    let loginData: any
    try { loginData = JSON.parse(await loginRes.text()) } catch { return NextResponse.json({ error: 'login parse failed', log }, { status: 500 }) }
    if (loginData.status !== 1) return NextResponse.json({ error: 'login failed', details: loginData, log }, { status: 500 })

    const allCookies = { ...cookies, ...parseCookies(loginRes.headers) }
    const postLoginToken = allCookies['TournoiEnLigneidt'] ?? allCookies['TournoiEnLigneid'] ?? ''
    if (!postLoginToken) return NextResponse.json({ error: 'no post-login token', log }, { status: 500 })
    log.push('login ok')

    const authHeaders = {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/json, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': postLoginToken,
      Origin: BASE,
      Cookie: cookieString(allCookies),
    }

    // Try various status values and also try fetching game history page
    const attempts: any[] = []

    for (const body of ['status=done', 'status=finished', 'status=end', 'status=done&turninfo=true', 'status=finished&turninfo=true']) {
      const r = await fetch(`${BASE}/tablemanager/tablemanager/tableinfos.html`, { method: 'POST', headers: authHeaders, body })
      let parsed: any
      try { parsed = await r.json() } catch { parsed = null }
      attempts.push({ body, httpStatus: r.status, apiStatus: parsed?.status, error: parsed?.error, tableCount: parsed?.data?.tables ? Object.keys(parsed.data.tables).length : null })
    }

    // Also try fetching the actual game history page
    const historyRes = await fetch(`${BASE}/gamereview`, { headers: { ...BROWSER_HEADERS, Cookie: cookieString(allCookies) } })
    log.push(`/gamereview: HTTP ${historyRes.status}`)

    const archiveRes = await fetch(`${BASE}/archive`, { headers: { ...BROWSER_HEADERS, Cookie: cookieString(allCookies) } })
    log.push(`/archive: HTTP ${archiveRes.status}`)

    // Try the tablemanager with status=done but also include the player parameter
    const myId = String(loginData.data?.user_id ?? loginData.data?.id ?? '')
    if (myId) {
      const withPlayer = await fetch(`${BASE}/tablemanager/tablemanager/tableinfos.html`, {
        method: 'POST',
        headers: authHeaders,
        body: `status=done&player=${myId}`,
      })
      let p: any
      try { p = await withPlayer.json() } catch { p = null }
      attempts.push({ body: `status=done&player=${myId}`, httpStatus: withPlayer.status, apiStatus: p?.status, error: p?.error, tableCount: p?.data?.tables ? Object.keys(p.data.tables).length : null })
    }

    return NextResponse.json({ log, attempts })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
