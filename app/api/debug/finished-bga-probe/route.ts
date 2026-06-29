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
    if (loginData.status !== 1) return NextResponse.json({ error: 'login failed', loginData, log }, { status: 500 })

    const allCookies = { ...cookies, ...parseCookies(loginRes.headers) }
    const myId = String(loginData.data?.user_id ?? loginData.data?.id ?? '')
    const postLoginToken = allCookies['TournoiEnLigneidt'] ?? allCookies['TournoiEnLigneid'] ?? ''
    if (!postLoginToken) return NextResponse.json({ error: 'no post-login token', log }, { status: 500 })
    log.push(`login ok, myId=${myId}`)

    const ajaxHeaders = {
      ...BROWSER_HEADERS,
      Cookie: cookieString(allCookies),
      Accept: 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': postLoginToken,
      Origin: BASE,
      Referer: `${BASE}/gamestats?player=${myId}`,
    }

    // Focus on gamestats/getGames — it returned a real "missing param" error, meaning the endpoint exists
    const attempts: any[] = []
    const endpoints = [
      // Try with updateStats=0 and updateStats=1 (GET)
      { label: 'getGames GET updateStats=0 player', url: `${BASE}/gamestats/gamestats/getGames.html?player=${myId}&updateStats=0` },
      { label: 'getGames GET updateStats=1 player', url: `${BASE}/gamestats/gamestats/getGames.html?player=${myId}&updateStats=1` },
      { label: 'getGames GET updateStats=0 player_id', url: `${BASE}/gamestats/gamestats/getGames.html?player_id=${myId}&updateStats=0` },
      // With start/length pagination
      { label: 'getGames GET updateStats=0 paginated', url: `${BASE}/gamestats/gamestats/getGames.html?player=${myId}&updateStats=0&start=0&length=20` },
      // With game filter cleared
      { label: 'getGames GET updateStats=0 no game filter', url: `${BASE}/gamestats/gamestats/getGames.html?player=${myId}&updateStats=0&game_id=0` },
      // Try other common param names
      { label: 'getGames GET updateStats=false', url: `${BASE}/gamestats/gamestats/getGames.html?player=${myId}&updateStats=false` },
      // Try more gamestats controller actions
      { label: 'gamestats/getLastResults', url: `${BASE}/gamestats/gamestats/getLastResults.html?player=${myId}&updateStats=0` },
      { label: 'gamestats/getResults', url: `${BASE}/gamestats/gamestats/getResults.html?player=${myId}&updateStats=0` },
      { label: 'gamestats/getTableHistory', url: `${BASE}/gamestats/gamestats/getTableHistory.html?player=${myId}&updateStats=0` },
    ]

    for (const { label, url } of endpoints) {
      const t0 = Date.now()
      const r = await fetch(url, { headers: ajaxHeaders })
      const text = await r.text()
      let parsed: any = null
      try { parsed = JSON.parse(text) } catch {}
      const isSuccess = parsed?.status === 1 || parsed?.status === '1'
      attempts.push({
        label,
        httpStatus: r.status,
        elapsedMs: Date.now() - t0,
        apiStatus: parsed?.status,
        error: parsed?.error,
        dataKeys: parsed?.data ? Object.keys(parsed.data) : undefined,
        // If success, show first table entry structure
        sampleData: isSuccess && parsed?.data ? JSON.stringify(parsed.data).slice(0, 800) : undefined,
        rawPreview: !isSuccess ? text.slice(0, 300) : undefined,
      })
    }

    return NextResponse.json({ log, myId, attempts })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
