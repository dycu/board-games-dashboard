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
    if (!requestToken) {
      const hexFound = [...loginPageHtml.matchAll(/[a-f0-9]{48,64}/gi)].map(m => m[0]).slice(0, 5)
      return NextResponse.json({ error: 'no request_token', hexFound, log }, { status: 500 })
    }

    const loginRes = await fetch(`${loginBase}/account/auth/loginUserWithPassword.html`, {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', 'X-Request-Token': requestToken, Origin: loginBase, Referer: `${loginBase}/?step=2&page=login`, Cookie: cookieString(cookies) },
      body: new URLSearchParams({ username, password, remember_me: 'true', request_token: requestToken }),
    })
    let loginData: any
    try { loginData = JSON.parse(await loginRes.text()) } catch { return NextResponse.json({ error: 'login parse failed', log }, { status: 500 }) }
    if (loginData.status !== 1) return NextResponse.json({ error: 'login failed', details: loginData, log }, { status: 500 })

    const allCookies = { ...cookies, ...parseCookies(loginRes.headers) }
    const myId = String(loginData.data?.user_id ?? loginData.data?.id ?? '')
    const postLoginToken = allCookies['TournoiEnLigneidt'] ?? allCookies['TournoiEnLigneid'] ?? ''
    if (!postLoginToken) return NextResponse.json({ error: 'no post-login token', log }, { status: 500 })
    log.push(`login ok, myId=${myId}`)

    const authHeaders = {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/json, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': postLoginToken,
      Origin: BASE,
      Cookie: cookieString(allCookies),
    }

    // Try status=finished with player filter (avoids returning ALL finished games)
    const attempts: any[] = []
    for (const body of [
      `status=finished&player=${myId}`,
      'status=finished',
    ]) {
      const r = await fetch(`${BASE}/tablemanager/tablemanager/tableinfos.html`, {
        method: 'POST', headers: { ...authHeaders, Referer: `${BASE}/gameinprogress` }, body,
      })
      let parsed: any = null
      try { parsed = await r.json() } catch {}
      const tables = parsed?.data?.tables ? Object.values(parsed.data.tables) : []
      const sampleTable = tables[0]
      attempts.push({
        body,
        httpStatus: r.status,
        apiStatus: parsed?.status,
        error: parsed?.error,
        tableCount: tables.length,
        sampleTableKeys: sampleTable ? Object.keys(sampleTable as object) : null,
        sampleTable: tables.length > 0 ? (sampleTable as any) : null,
      })
      if (parsed?.status === 1) break // found it
    }

    // Fetch the /archive page and show its content
    const archiveRes = await fetch(`${BASE}/archive`, { headers: { ...BROWSER_HEADERS, Cookie: cookieString(allCookies) } })
    const archiveHtml = await archiveRes.text()
    const archivePreview = archiveHtml.slice(0, 2000)

    // Check for any API calls the archive page makes (look for embedded JS data/tables)
    const archiveApiCalls = (archiveHtml.match(/\/[a-z]+\/[a-z]+\/[a-z]+\.html/g) ?? []).slice(0, 10)

    return NextResponse.json({ log, attempts, archiveStatus: archiveRes.status, archivePreview, archiveApiCalls })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
