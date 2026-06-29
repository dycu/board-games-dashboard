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

    // Step 1: fetch the lastresults player page and look inside for game data
    const playerPageRes = await fetch(`${BASE}/player?id=${myId}&section=lastresults`, { headers: browserHeaders })
    const playerHtml = await playerPageRes.text()
    log.push(`player?section=lastresults HTTP ${playerPageRes.status}, bodyLen=${playerHtml.length}`)

    // Search the HTML for patterns that look like game results
    const lastResultsSection = (() => {
      const idx = playerHtml.indexOf('lastresults')
      return idx >= 0 ? playerHtml.slice(Math.max(0, idx - 100), idx + 2000) : null
    })()
    const tableIdSection = (() => {
      const idx = playerHtml.indexOf('table_id')
      return idx >= 0 ? playerHtml.slice(Math.max(0, idx - 50), idx + 500) : null
    })()
    // Look for game name patterns in various formats
    const gameNamePatterns = (playerHtml.match(/(?:gamename|game_name|gameName|"game"\s*:)[^"]{0,5}"([^"]{2,60})"/gi) ?? []).slice(0, 10)
    // Look for any section with "results"
    const resultsDivs = (playerHtml.match(/<div[^>]*(?:result|lastresult|history)[^>]*>[\s\S]{0,500}/gi) ?? []).slice(0, 3)
    // Look for any BGA module/controller path hints in embedded JS
    const controllerHints = [...new Set((playerHtml.match(/["']\/(player|archive|gamestat|result)[^"']+\.html[^"']*/gi) ?? []).slice(0, 20))]
    // Look for Ajax.call patterns to find what BGA calls on this page
    const ajaxCallPatterns = (playerHtml.match(/ajax(?:Call)?\s*\(\s*['"]([^'"]+)['"]/gi) ?? []).slice(0, 20)
    const ajaxCallPatterns2 = (playerHtml.match(/callModule\s*\(\s*['"]([^'"]+)['"][^)]{0,100}/gi) ?? []).slice(0, 20)

    log.push(`lastResultsSection found: ${lastResultsSection !== null}`)

    // Step 2: fetch the ajax=1 version of the same page (BGA typically returns section HTML)
    const ajaxPageRes = await fetch(`${BASE}/player?id=${myId}&section=lastresults&ajax=1`, {
      headers: { ...browserHeaders, 'X-Requested-With': 'XMLHttpRequest' },
    })
    const ajaxPageText = await ajaxPageRes.text()
    log.push(`player?section=lastresults&ajax=1 HTTP ${ajaxPageRes.status}, bodyLen=${ajaxPageText.length}`)

    // Try to parse it and look for game data
    let ajaxPageParsed: any = null
    try { ajaxPageParsed = JSON.parse(ajaxPageText) } catch {}
    const ajaxPagePreview = ajaxPageText.slice(0, 2000)
    // Look for table IDs or game names in the ajax response
    const ajaxGameRows = (ajaxPageText.match(/(?:table_id|game_name|gamename)[^"]{0,5}"([^"]{1,60})"/gi) ?? []).slice(0, 10)
    const ajaxTableIds = (ajaxPageText.match(/\btable_?id[=:]["']?(\d+)/gi) ?? []).slice(0, 10)

    // Step 3: try more specific AJAX endpoints discovered from inspecting BGA's JS
    const specificAttempts: any[] = []
    const endpoints = [
      // player controller with different action names
      { label: 'player/getLastResults', method: 'GET', url: `${BASE}/player/player/getResults.html?id=${myId}` },
      { label: 'player/gethistory', method: 'GET', url: `${BASE}/player/player/gethistory.html?id=${myId}` },
      { label: 'player/section ajax', method: 'GET', url: `${BASE}/player/player/section.html?id=${myId}&section=lastresults` },
      { label: 'player index section', method: 'GET', url: `${BASE}/player/player/index.html?id=${myId}&section=lastresults&ajax=1` },
      // gameresult controller
      { label: 'gameresult/getlast', method: 'GET', url: `${BASE}/gameresult/gameresult/getLastResults.html?player=${myId}` },
      { label: 'gameresult/index', method: 'GET', url: `${BASE}/gameresult/gameresult/index.html?player=${myId}&ajax=1` },
      // table controller with proper id param
      { label: 'tablemanager finished (no player)', method: 'POST', url: `${BASE}/tablemanager/tablemanager/tableinfos.html`, body: `status=finished&start=0&nbmax=10` },
    ]
    for (const { label, method, url, body } of endpoints) {
      const t0 = Date.now()
      const headers = body
        ? { ...ajaxHeaders, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Referer: `${BASE}/player?id=${myId}&section=lastresults` }
        : { ...ajaxHeaders, Referer: `${BASE}/player?id=${myId}&section=lastresults` }
      const r = await fetch(url, { method, headers, ...(body ? { body } : {}) })
      const text = await r.text()
      specificAttempts.push({ label, httpStatus: r.status, elapsedMs: Date.now() - t0, rawPreview: text.slice(0, 400) })
    }

    return NextResponse.json({
      log,
      myId,
      playerPageAnalysis: {
        bodyLen: playerHtml.length,
        lastResultsSection,
        tableIdSection,
        gameNamePatterns,
        resultsDivs,
        controllerHints,
        ajaxCallPatterns,
        ajaxCallPatterns2,
      },
      ajaxPage: {
        httpStatus: ajaxPageRes.status,
        bodyLen: ajaxPageText.length,
        parsed: ajaxPageParsed,
        preview: ajaxPagePreview,
        ajaxGameRows,
        ajaxTableIds,
      },
      specificAttempts,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
