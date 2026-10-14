const BASE = 'https://www.yucata.de'

function collectCookies(res: Response, jar: Record<string, string>): void {
  const getAll = res.headers.getSetCookie
  const raw = typeof getAll === 'function'
    ? getAll.call(res.headers)
    : [res.headers.get('set-cookie')].filter((v): v is string => !!v)
  for (const cookie of raw) {
    const pair = cookie.split(';')[0]
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
}

export async function GET() {
  const username = process.env.YUCATA_USERNAME ?? ''
  const password = process.env.YUCATA_PASSWORD ?? ''
  const jar: Record<string, string> = {}

  const initRes = await fetch(`${BASE}/en`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, redirect: 'manual' })
  collectCookies(initRes, jar)
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Cookie: cookieHeader(jar), 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ login: username, password, remember: false }),
  })
  const loginData = await loginRes.json()
  if (!loginData.success) return Response.json({ error: 'login failed' }, { status: 500 })
  collectCookies(loginRes, jar)

  const headers = { Accept: 'text/html', Cookie: cookieHeader(jar), 'User-Agent': 'Mozilla/5.0' }
  const overviewRes = await fetch(`${BASE}/en/Overview`, { headers })
  const html = await overviewRes.text()

  // Broaden the net: any word near a digit that could be a round/phase/era counter
  const broad = [...html.matchAll(/.{0,25}(round|turn|phase|era|age|stage|runde|zug|move)[a-z]*["'\s:>]{0,5}\d*.{0,25}/gi)].map(m => m[0])
  // Also check for an embedded JSON blob (window.__ state) a Blazor/SPA app often ships
  const jsonBlobs = [...html.matchAll(/window\.\w+\s*=\s*(\{[\s\S]{0,300})/g)].map(m => m[1])
  const scriptTags = [...html.matchAll(/<script[^>]*>([\s\S]{0,200})/g)].map(m => m[1]).slice(0, 10)

  return Response.json({
    htmlLength: html.length,
    broadMatches: [...new Set(broad)].slice(0, 40),
    jsonBlobs: jsonBlobs.slice(0, 5),
    scriptTagsPreview: scriptTags,
  })
}
