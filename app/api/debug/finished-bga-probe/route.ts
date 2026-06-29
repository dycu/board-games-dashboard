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
  for (const raw of list) { const [kv] = raw.split(';'); const eq = kv.indexOf('='); if (eq > 0) cookies[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim() }
  return cookies
}
function cookieString(c: Record<string, string>) { return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ') }
function extractRequestToken(html: string): string {
  const m = html.match(/g_requestToken\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/['"]request_token['"]\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/name=['"]request_token['"][^>]*value=['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/\brequestToken['"\s:=,]+([a-f0-9]{64})\b/i)
           ?? html.match(/\brequest_token['"\s:=,]+([a-f0-9]{64})\b/i)
  return m ? m[m.length - 1] : ''
}

export async function GET() {
  const username = process.env.BGA_USERNAME
  const password = process.env.BGA_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const log: string[] = []
  try {
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
    const loginPageHtml = await loginPageRes.text()
    const requestToken = extractRequestToken(loginPageHtml)
    if (!requestToken) return NextResponse.json({ error: 'no request_token', log }, { status: 500 })

    const loginRes = await fetch(`${loginBase}/account/auth/loginUserWithPassword.html`, {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', 'X-Request-Token': requestToken, Origin: loginBase, Referer: `${loginBase}/?step=2&page=login`, Cookie: cookieString(cookies) },
      body: new URLSearchParams({ username, password, remember_me: 'true', request_token: requestToken }),
    })
    let loginData: any
    try { loginData = JSON.parse(await loginRes.text()) } catch { return NextResponse.json({ error: 'login parse failed', log }, { status: 500 }) }
    if (loginData.status !== 1) return NextResponse.json({ error: 'login failed', log }, { status: 500 })

    const allCookies = { ...cookies, ...parseCookies(loginRes.headers) }
    const myId = String(loginData.data?.user_id ?? loginData.data?.id ?? '')
    const postLoginToken = allCookies['TournoiEnLigneidt'] ?? allCookies['TournoiEnLigneid'] ?? ''
    if (!postLoginToken) return NextResponse.json({ error: 'no post-login token', log }, { status: 500 })
    log.push(`login ok, myId=${myId}`)

    // Fetch BGA home page and look for embedded game data
    const homeRes = await fetch(`${BASE}/`, { headers: { ...BROWSER_HEADERS, Cookie: cookieString(allCookies) } })
    const homeHtml = await homeRes.text()
    log.push(`home bodyLen=${homeHtml.length}`)

    // Extract JS variable assignments that might contain game table data
    // BGA often embeds data as: var g_gamedatas = {...}; or jstpl_xxx = '...'
    const jsVarMatches = (homeHtml.match(/\bg_[a-z_]+\s*=\s*\{[^;]{0,200}/gi) ?? []).slice(0, 8)
    // Look for "gameover", "archive", "finished" in any context
    const contextualMatches = (homeHtml.match(/.{0,50}(?:gameover|date_end|recently.{0,10}finish)[^<]{0,100}/gi) ?? []).slice(0, 5)

    // Try BGA's home API - fetch gameinprogress page and look for status values beyond "play"
    const gpRes = await fetch(`${BASE}/gameinprogress`, { headers: { ...BROWSER_HEADERS, Cookie: cookieString(allCookies) } })
    const gpHtml = await gpRes.text()
    log.push(`gameinprogress bodyLen=${gpHtml.length}`)
    const gpStatusValues = [...new Set((gpHtml.match(/"status"\s*:\s*"([^"]+)"/g) ?? []).map(m => m.match(/"([^"]+)"$/)?.[1] ?? ''))]

    // Try table overview controller which might list all user games
    const authHeaders = {
      ...BROWSER_HEADERS,
      Accept: 'application/json, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': postLoginToken,
      Cookie: cookieString(allCookies),
    }
    const overviewAttempts: any[] = []
    for (const [path, body] of [
      [`${BASE}/tablemanager/tablemanager/tableinfos.html`, `status=finished&player=${myId}&recent=true`],
      [`${BASE}/tablemanager/tablemanager/tableinfos.html`, `status=finished&turninfo=true&player=${myId}`],
    ] as [string, string][]) {
      const r = await fetch(path, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Referer: `${BASE}/gameinprogress` }, body })
      let parsed: any = null; try { parsed = await r.json() } catch {}
      overviewAttempts.push({ body, status: r.status, apiStatus: parsed?.status, error: parsed?.error })
    }

    return NextResponse.json({ log, jsVarMatches, contextualMatches, gpStatusValues, overviewAttempts })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
