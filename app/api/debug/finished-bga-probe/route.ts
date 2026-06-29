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

    const browserHeaders = {
      ...BROWSER_HEADERS,
      Cookie: cookieString(allCookies),
      Accept: 'text/html,application/xhtml+xml,*/*',
    }
    const ajaxHeaders = {
      ...BROWSER_HEADERS,
      Cookie: cookieString(allCookies),
      Accept: 'application/json, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': postLoginToken,
      Origin: BASE,
    }

    // Step 1: fetch the lastresults player page (what the browser sees)
    const playerPageRes = await fetch(`${BASE}/player?id=${myId}&section=lastresults`, { headers: browserHeaders })
    const playerHtml = await playerPageRes.text()
    log.push(`player?section=lastresults HTTP ${playerPageRes.status}, bodyLen=${playerHtml.length}`)

    // Look for embedded game data (JS vars, JSON blobs, table IDs)
    const embeddedJsonBlobs = (playerHtml.match(/\bg_[a-zA-Z_]+\s*=\s*(\{[^;]{0,500})/g) ?? []).slice(0, 10)
    const ajaxUrlHints = [...new Set((playerHtml.match(/(?:url|href|action)\s*[=:]\s*['"]([^'"]*(?:player|archive|result|history|game)[^'"]*)['"]/gi) ?? []).slice(0, 20))]
    const scriptSrcHints = (playerHtml.match(/<script[^>]+src=['"]([^'"]+)['"]/gi) ?? []).slice(0, 10)
    // Look for table rows that might contain game data
    const tableRowSample = (playerHtml.match(/<tr[^>]*>[\s\S]{0,300}/g) ?? []).slice(0, 5).map(s => s.slice(0, 200))
    // Look for any JSON-like structures embedded
    const jsonStructures = (playerHtml.match(/\{[^{}]{20,400}\}/g) ?? [])
      .filter(s => s.includes('game') || s.includes('table') || s.includes('result'))
      .slice(0, 5)

    log.push(`embeddedJsonBlobs found: ${embeddedJsonBlobs.length}, ajaxUrlHints: ${ajaxUrlHints.length}`)

    // Step 2: try AJAX endpoints that BGA might call to populate lastresults
    const ajaxAttempts: any[] = []
    const ajaxEndpoints = [
      // player controller endpoints
      { method: 'GET', url: `${BASE}/player/player/getLastResults.html?id=${myId}` },
      { method: 'GET', url: `${BASE}/player/player/getLastResults.html?player_id=${myId}` },
      { method: 'GET', url: `${BASE}/player/player/lastresults.html?id=${myId}` },
      { method: 'GET', url: `${BASE}/player/player/index.html?id=${myId}&section=lastresults` },
      // Generic player profile with ajax flag
      { method: 'GET', url: `${BASE}/player?id=${myId}&section=lastresults&ajax=1` },
      // archive controller
      { method: 'GET', url: `${BASE}/archive/archive/index.html?player=${myId}&ajax=1` },
      { method: 'GET', url: `${BASE}/archive/archive/getLastResults.html?player=${myId}` },
      { method: 'GET', url: `${BASE}/archive/archive/results.html?player=${myId}` },
      // gamestat
      { method: 'GET', url: `${BASE}/gamestat/gamestat/getPlayerStats.html?player=${myId}` },
      { method: 'GET', url: `${BASE}/gamestat/gamestat/index.html?player=${myId}&ajax=1` },
      // table controller for finished
      { method: 'POST', url: `${BASE}/table/table/tableinfos.html`, body: `status=finished&player=${myId}` },
      { method: 'POST', url: `${BASE}/table/table/getLastResults.html`, body: `player=${myId}` },
    ]

    for (const { method, url, body } of ajaxEndpoints) {
      const t0 = Date.now()
      try {
        const headers = body
          ? { ...ajaxHeaders, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Referer: `${BASE}/player?id=${myId}&section=lastresults` }
          : { ...ajaxHeaders, Referer: `${BASE}/player?id=${myId}&section=lastresults` }
        const r = await fetch(url, { method, headers, ...(body ? { body } : {}) })
        const text = await r.text()
        const elapsedMs = Date.now() - t0
        let parsed: any = null
        try { parsed = JSON.parse(text) } catch {}
        ajaxAttempts.push({
          method, url,
          httpStatus: r.status,
          elapsedMs,
          apiStatus: parsed?.status,
          error: parsed?.error,
          dataKeys: parsed?.data ? Object.keys(parsed.data) : undefined,
          rawPreview: text.slice(0, 300),
        })
      } catch (e: any) {
        ajaxAttempts.push({ method, url, elapsedMs: Date.now() - t0, fetchError: e.message })
      }
    }

    return NextResponse.json({
      log,
      myId,
      playerPage: {
        httpStatus: playerPageRes.status,
        bodyLen: playerHtml.length,
        embeddedJsonBlobs,
        ajaxUrlHints,
        scriptSrcHints,
        tableRowSample,
        jsonStructures,
      },
      ajaxAttempts,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
