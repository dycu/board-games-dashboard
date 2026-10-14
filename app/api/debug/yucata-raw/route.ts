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
  if (!loginData.success) return Response.json({ error: 'login failed', loginData }, { status: 500 })
  collectCookies(loginRes, jar)

  const headers = { Accept: 'application/json', Cookie: cookieHeader(jar), 'User-Agent': 'Mozilla/5.0', Referer: `${BASE}/en/Overview` }
  const gamesRes = await fetch(`${BASE}/api/user/me/games/current`, { headers })
  const gamesData = await gamesRes.json()
  const games: any[] = gamesData.games ?? []

  // The single-game page is a client-rendered shell — find what API path it
  // actually calls for board state, by grepping its referenced JS bundle(s)
  const firstId = games[0]?.id
  let gamePageHtml = ''
  let apiHints: string[] = []
  let stateProbe: Record<string, any> = {}
  if (firstId) {
    const pageRes = await fetch(`${BASE}/en/game/${firstId}`, { headers: { ...headers, Accept: 'text/html' } })
    gamePageHtml = await pageRes.text()
    const scriptSrcs = [...gamePageHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]).slice(0, 5)
    for (const src of scriptSrcs) {
      const url = src.startsWith('http') ? src : `${BASE}${src.startsWith('/') ? '' : '/'}${src}`
      try {
        const jsRes = await fetch(url, { headers })
        const js = await jsRes.text()
        const hints = [...js.matchAll(/["'`](\/api\/[a-zA-Z0-9/_-]*game[a-zA-Z0-9/_-]*)["'`]/gi)].map(m => m[1])
        apiHints.push(...new Set(hints))
      } catch { /* ignore */ }
    }
    apiHints = [...new Set(apiHints)].slice(0, 30)

    // Try a few plausible endpoints directly
    for (const path of [`/api/game/${firstId}`, `/api/game/${firstId}/state`, `/api/user/me/game/${firstId}`, `/api/game/me/${firstId}`]) {
      try {
        const res = await fetch(`${BASE}${path}`, { headers })
        if (res.ok) {
          const text = await res.text()
          stateProbe[path] = text.slice(0, 500)
        } else {
          stateProbe[path] = `HTTP ${res.status}`
        }
      } catch (e) {
        stateProbe[path] = String(e)
      }
    }
  }

  return Response.json({
    rawFirstGame: games[0] ?? null,
    allKeys: games[0] ? Object.keys(games[0]) : [],
    gamePageHtmlLength: gamePageHtml.length,
    apiHints,
    stateProbe,
  })
}
