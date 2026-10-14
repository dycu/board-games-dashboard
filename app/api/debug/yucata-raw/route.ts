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

  // Try the individual game page's HTML for a round/turn indicator too
  const firstId = games[0]?.id
  let gamePageSnippet: string | null = null
  if (firstId) {
    const pageRes = await fetch(`${BASE}/en/game/${firstId}`, { headers: { ...headers, Accept: 'text/html' } })
    const html = await pageRes.text()
    const matches = [...html.matchAll(/.{0,40}(round|turn|runde|zug)[^<]{0,40}/gi)].map(m => m[0])
    gamePageSnippet = matches.slice(0, 30).join(' ||| ') || `(no round/turn match, ${html.length} bytes, status ${pageRes.status})`
  }

  return Response.json({ rawFirstGame: games[0] ?? null, allKeys: games[0] ? Object.keys(games[0]) : [], gamePageSnippet })
}
