import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json, text/html, */*' }

async function probe(url: string, opts?: RequestInit): Promise<{ status: number; body: string; cookies: string }> {
  try {
    const r = await fetch(url, { ...opts, headers: { ...HEADERS, ...(opts?.headers ?? {}) }, signal: AbortSignal.timeout(5000) })
    const body = await r.text()
    const cookies = r.headers.get('set-cookie') ?? ''
    return { status: r.status, body: body.slice(0, 300), cookies: cookies.slice(0, 100) }
  } catch (e: any) {
    return { status: 0, body: e.message, cookies: '' }
  }
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'CHOOCHOO_USERNAME / CHOOCHOO_PASSWORD not set' }, { status: 500 })
  }

  // Phase 1: probe main page and API paths (parallel, 5s each)
  const [mainPage, apiRoot, apiXsrf, apiGames, loginPage] = await Promise.all([
    probe('https://www.choochoo.games'),
    probe('https://www.choochoo.games/api'),
    probe('https://www.choochoo.games/api/xsrf'),
    probe('https://www.choochoo.games/api/games'),
    probe('https://www.choochoo.games/login'),
  ])

  // Phase 2: try login attempts (sequential so we can use cookies)
  const loginAttempts: any[] = []

  // Attempt A: JSON login without XSRF
  const lA = await probe('https://www.choochoo.games/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: username, password }),
  })
  loginAttempts.push({ url: '/api/users/login (no xsrf)', ...lA })

  // Attempt B: form POST to /login
  const lB = await probe('https://www.choochoo.games/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, email: username }).toString(),
  })
  loginAttempts.push({ url: '/login (form)', ...lB })

  // Extract JS bundle URL from main page to find API calls
  const bundleMatch = mainPage.body.match(/src="([^"]*(?:app|main|index)[^"]*\.js[^"]*)"/i)
  const bundleUrl = bundleMatch ? new URL(bundleMatch[1], 'https://www.choochoo.games').href : null

  let bundleSnippet = ''
  if (bundleUrl) {
    const bundle = await probe(bundleUrl)
    // Search for API paths in the bundle
    const apiPaths = [...(bundle.body.match(/["'](\/api\/[^"']{2,40})["']/g) ?? [])].slice(0, 10)
    bundleSnippet = apiPaths.join(', ')
  }

  return NextResponse.json({
    mainPage: { status: mainPage.status, bodyStart: mainPage.body.slice(0, 200) },
    apiRoot,
    apiXsrf,
    apiGames,
    loginPage: { status: loginPage.status, bodyStart: loginPage.body.slice(0, 100) },
    loginAttempts,
    bundleUrl,
    bundleApiPaths: bundleSnippet,
  })
}
