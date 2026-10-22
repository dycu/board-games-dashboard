import { NextResponse } from 'next/server'

// TEMPORARY — live discovery for the boardgamers.space connector. Logs in
// with the real production credentials and dumps the shape of a handful of
// candidate "my games" endpoints, so the real connector can be built against
// confirmed responses instead of guesses. Never logs the password or the raw
// cookie value, only cookie names. Remove once lib/connectors/boardgamers.ts
// is working.

const BASE = 'https://boardgamers.space'
const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
}

function parseCookieHeader(setCookie: string): string {
  // May be multiple Set-Cookie lines joined with ", " by fetch's Headers —
  // each cookie's own value can itself contain commas (e.g. in an
  // expires= date), so split on ", " followed by a token= pattern instead
  // of a bare comma.
  return setCookie
    .split(/,(?=\s*[A-Za-z0-9_-]+=)/)
    .map(c => c.split(';')[0].trim())
    .filter(c => c.includes('='))
    .join('; ')
}

async function probe(path: string, cookie: string) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { ...BROWSER, Cookie: cookie } })
    const text = await res.text()
    let json: unknown = null
    try { json = JSON.parse(text) } catch { /* not JSON */ }
    return { status: res.status, body: json ?? text.slice(0, 1500) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function GET() {
  const email = process.env.BOARDGAMERS_USERNAME
  const password = process.env.BOARDGAMERS_PASSWORD
  if (!email || !password) {
    return NextResponse.json({ error: 'BOARDGAMERS_USERNAME / BOARDGAMERS_PASSWORD not set' }, { status: 500 })
  }

  const loginRes = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: {
      ...BROWSER,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE,
      Referer: `${BASE}/login`,
    },
    body: new URLSearchParams({ redirect: '/login', email, password }),
    redirect: 'manual',
  })
  const setCookieHeader = loginRes.headers.get('set-cookie') ?? ''
  const loginBodyText = await loginRes.text().catch(() => '')
  const cookie = parseCookieHeader(setCookieHeader)

  const [account, activeMine, activePlain, openMine, endedMine] = await Promise.all([
    probe('/api/account', cookie),
    probe('/api/game/status/active?mine=true&count=50&skip=0', cookie),
    probe('/api/game/status/active?count=50&skip=0', cookie),
    probe('/api/game/status/open?mine=true&count=50&skip=0', cookie),
    probe('/api/game/status/ended?mine=true&count=10&skip=0', cookie),
  ])

  return NextResponse.json({
    loginStatus: loginRes.status,
    loginLocationHeader: loginRes.headers.get('location'),
    loginBodyPreview: loginBodyText.slice(0, 500),
    cookiePresent: !!cookie,
    cookieNames: cookie.split(';').map(c => c.trim().split('=')[0]).filter(Boolean),
    account,
    activeMine,
    activePlain,
    openMine,
    endedMine,
  })
}
