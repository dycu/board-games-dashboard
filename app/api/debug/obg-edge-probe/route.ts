export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  const username = process.env.OBG_USERNAME ?? ''
  const password = process.env.OBG_PASSWORD ?? ''
  const log: string[] = []

  const BASE = 'https://www.onlineboardgamers.com'
  const BROWSER = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
  }

  // Step 1: GET /login/ to obtain Django csrftoken cookie + csrfmiddlewaretoken form field
  const loginPageRes = await fetch(`${BASE}/login/`, { headers: BROWSER })
  const loginPageHtml = await loginPageRes.text()
  const rawCookies = loginPageRes.headers.get('set-cookie') ?? ''
  // Extract just the csrftoken value from cookie header
  const csrfCookieMatch = rawCookies.match(/csrftoken=([^;,\s]+)/)
  const csrfCookieVal = csrfCookieMatch?.[1] ?? ''
  // Extract csrfmiddlewaretoken from the form
  const csrfTokenMatch = loginPageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)
    ?? loginPageHtml.match(/csrfmiddlewaretoken['"]\s+value=['"]([^'"]+)['"]/)
  const csrfMiddleware = csrfTokenMatch?.[1] ?? csrfCookieVal
  log.push(`login page: HTTP ${loginPageRes.status} csrfCookie=${csrfCookieVal.slice(0,20)} csrfForm=${csrfMiddleware.slice(0,20)}`)

  // Step 2: POST /login/ with Django CSRF token, username, password
  const formBody = new URLSearchParams({
    csrfmiddlewaretoken: csrfMiddleware,
    username,
    password,
    next: '/',
  })
  const loginRes = await fetch(`${BASE}/login/`, {
    method: 'POST',
    headers: {
      ...BROWSER,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${BASE}/login/`,
      'Origin': BASE,
      'Sec-Fetch-Site': 'same-origin',
      Cookie: `csrftoken=${csrfCookieVal}`,
    },
    body: formBody.toString(),
    redirect: 'manual',
  })
  const loginBody = await loginRes.text()
  const loginCookies = loginRes.headers.get('set-cookie') ?? ''
  const loginLoc = loginRes.headers.get('location') ?? ''
  const loginError = loginBody.match(/<div[^>]*class="error"[^>]*>([^<]+)<\/div>/)?.[1]?.trim() ?? 'no error div'
  const sessionid = loginCookies.match(/\bsessionid=([^;,\s]+)/)?.[1]
  log.push(`POST login: HTTP ${loginRes.status} loc=${loginLoc} sessionid=${sessionid ? sessionid.slice(0,12)+'...' : 'none'} error="${loginError}"`)

  // Successful login: got a sessionid cookie, or redirected away from /login/
  const loginSuccess = !!sessionid || (loginRes.status >= 300 && loginRes.status < 400 && loginLoc && loginLoc !== '/login/' && loginLoc !== `${BASE}/login/`)
  log.push(`login success: ${loginSuccess}`)

  if (!loginSuccess) {
    return Response.json({ name: 'obg-edge', log, loginPageSnippet: loginPageHtml.slice(0, 2000) })
  }

  // Step 3: collect session cookies and fetch active games
  const allCookieParts: string[] = [`csrftoken=${csrfCookieVal}`]
  for (const c of loginCookies.split(',')) {
    const kv = c.trim().split(';')[0]
    if (kv) allCookieParts.push(kv)
  }
  const sessionCookie = allCookieParts.join('; ')

  // Try known game list URLs
  const gameUrls = ['/games/', '/dashboard/', '/my-games/', '/active-games/', '/']
  for (const path of gameUrls) {
    const r = await fetch(`${BASE}${path}`, {
      headers: { ...BROWSER, Cookie: sessionCookie, 'Sec-Fetch-Site': 'same-origin' },
      redirect: 'manual',
    })
    const body = await r.text()
    const loc = r.headers.get('location') ?? ''
    log.push(`GET ${path}: HTTP ${r.status} loc=${loc} len=${body.length} body=${body.slice(0, 150)}`)
    if (r.status === 200 && body.length > 2000) {
      return Response.json({ name: 'obg-edge', success: true, log, gamesHtml: body.slice(0, 6000) })
    }
  }

  return Response.json({ name: 'obg-edge', log })
}
