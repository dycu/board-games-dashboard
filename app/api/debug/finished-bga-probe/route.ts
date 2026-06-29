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

    const browserHeaders = { ...BROWSER_HEADERS, Cookie: cookieString(allCookies), Accept: 'text/html,application/xhtml+xml,*/*' }
    const ajaxHeaders = { ...BROWSER_HEADERS, Cookie: cookieString(allCookies), Accept: 'application/json, text/javascript, */*', 'X-Requested-With': 'XMLHttpRequest', 'X-Request-Token': postLoginToken, Origin: BASE }

    // Step 1: fetch /gamestats?player=myId (linked from lastresults section as "games history")
    const gamestatsRes = await fetch(`${BASE}/gamestats?player=${myId}`, { headers: browserHeaders })
    const gamestatsHtml = await gamestatsRes.text()
    log.push(`/gamestats HTTP ${gamestatsRes.status}, bodyLen=${gamestatsHtml.length}`)

    // Look for embedded JSON data, API call patterns, table data
    const gamestatsEmbeddedJson = (gamestatsHtml.match(/\bg_[a-zA-Z_]+\s*=\s*(\{[^;]{0,1000})/g) ?? []).slice(0, 10)
    const gamestatsAjaxCalls = (gamestatsHtml.match(/(?:callModule|ajax)\s*\(\s*['"]([^'"]+)['"]/gi) ?? []).slice(0, 20)
    const gamestatsControllers = [...new Set((gamestatsHtml.match(/["'\/](gamestats|gamestat|gameresult|gamehistory)[^"']{0,100}/gi) ?? []).slice(0, 20))]
    // Find game entries — BGA often uses data-game-id, data-table-id type attrs
    const dataAttrs = (gamestatsHtml.match(/data-(?:game|table|result)[^=]{0,20}=["']([^"']{1,60})["']/gi) ?? []).slice(0, 20)
    // Look for JSON structures that might be game results
    const gameResultStructures = (gamestatsHtml.match(/\{[^{}]{0,500}(?:game_name|table_id|gameresult)[^{}]{0,500}\}/g) ?? []).slice(0, 5)
    // Look for script tags with game data
    const inlineScripts = (gamestatsHtml.match(/<script[^>]*>([\s\S]{0,500}gamestat[\s\S]{0,500})<\/script>/gi) ?? []).slice(0, 3)
    // Grab first 3000 chars of body content (after <body> tag)
    const bodyStart = gamestatsHtml.indexOf('<body')
    const bodyPreview = bodyStart >= 0 ? gamestatsHtml.slice(bodyStart, bodyStart + 3000) : gamestatsHtml.slice(0, 3000)

    // Step 2: try gamestats AJAX endpoints
    const gamestatsAttempts: any[] = []
    const endpoints = [
      { label: 'gamestats/getPlayerStats GET', method: 'GET', url: `${BASE}/gamestats/gamestats/getPlayerStats.html?player=${myId}` },
      { label: 'gamestats/index GET ajax', method: 'GET', url: `${BASE}/gamestats/gamestats/index.html?player=${myId}&ajax=1` },
      { label: 'gamestats/getGames GET', method: 'GET', url: `${BASE}/gamestats/gamestats/getGames.html?player=${myId}` },
      { label: 'gamestats/getLastGames GET', method: 'GET', url: `${BASE}/gamestats/gamestats/getLastGames.html?player=${myId}` },
      { label: 'gamestats/getHistory GET', method: 'GET', url: `${BASE}/gamestats/gamestats/getHistory.html?player=${myId}` },
      { label: 'gamestats/gameresults GET', method: 'GET', url: `${BASE}/gamestats/gamestats/gameresults.html?player=${myId}` },
      { label: 'gamestats page ajax=1', method: 'GET', url: `${BASE}/gamestats?player=${myId}&ajax=1` },
      { label: 'gamestats/getTableList POST', method: 'POST', url: `${BASE}/gamestats/gamestats/getTableList.html`, body: `player=${myId}&start=0&length=20` },
      { label: 'gamestats/getTableList POST2', method: 'POST', url: `${BASE}/gamestats/gamestats/getTableList.html`, body: `player_id=${myId}&start=0&length=20` },
    ]
    for (const { label, method, url, body } of endpoints) {
      const t0 = Date.now()
      const headers = body
        ? { ...ajaxHeaders, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Referer: `${BASE}/gamestats?player=${myId}` }
        : { ...ajaxHeaders, Referer: `${BASE}/gamestats?player=${myId}` }
      const r = await fetch(url, { method, headers, ...(body ? { body } : {}) })
      const text = await r.text()
      let parsed: any = null
      try { parsed = JSON.parse(text) } catch {}
      gamestatsAttempts.push({
        label,
        httpStatus: r.status,
        elapsedMs: Date.now() - t0,
        apiStatus: parsed?.status,
        error: parsed?.error,
        dataKeys: parsed?.data ? Object.keys(parsed.data) : undefined,
        rawPreview: text.slice(0, 400),
      })
    }

    return NextResponse.json({
      log,
      myId,
      gamestats: {
        httpStatus: gamestatsRes.status,
        bodyLen: gamestatsHtml.length,
        bodyPreview,
        embeddedJson: gamestatsEmbeddedJson,
        ajaxCalls: gamestatsAjaxCalls,
        controllers: gamestatsControllers,
        dataAttrs,
        gameResultStructures,
        inlineScripts,
      },
      gamestatsAttempts,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
