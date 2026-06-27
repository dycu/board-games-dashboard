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
    'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
  }

  // Step 1: fetch homepage to find login form + CSRF token + cookies
  const homeRes = await fetch(BASE, { headers: BROWSER })
  const homeHtml = await homeRes.text()
  const homeCookies = homeRes.headers.get('set-cookie') ?? ''
  log.push(`home: HTTP ${homeRes.status} len=${homeHtml.length} cookies=${homeCookies.slice(0, 80)}`)

  // Extract CSRF token if present
  const csrfMatch = homeHtml.match(/name="_token"\s+value="([^"]+)"/)
    ?? homeHtml.match(/<meta[^>]+name="csrf-token"[^>]+content="([^"]+)"/)
    ?? homeHtml.match(/csrf[_-]token['":\s]+['"]([^'"]{10,80})['"]/)
  const csrf = csrfMatch?.[1] ?? ''
  log.push(`csrf: ${csrf.slice(0, 40) || '(not found)'}`)

  // Find form action
  const formActionMatch = homeHtml.match(/<form[^>]+action="([^"]*login[^"]*)"/)
  log.push(`form action: ${formActionMatch?.[1] ?? '(not found)'}`)

  // Find login-related links/URLs in the HTML
  const loginLinks = [...homeHtml.matchAll(/href="([^"]*(?:login|signin|auth)[^"]*)"/gi)]
    .map(m => m[1]).slice(0, 10)
  log.push(`login links: ${loginLinks.join(', ')}`)

  // Snippet of the HTML for inspection
  const loginSection = homeHtml.slice(homeHtml.toLowerCase().indexOf('login'), homeHtml.toLowerCase().indexOf('login') + 800)

  // Step 2: fetch /login page specifically (follow redirect)
  const loginPageRes = await fetch(`${BASE}/login`, { headers: BROWSER })
  const loginPageHtml = await loginPageRes.text()
  const loginCookies = loginPageRes.headers.get('set-cookie') ?? ''
  const loginCsrf = loginPageHtml.match(/name="_token"\s+value="([^"]+)"/)
    ?? loginPageHtml.match(/<meta[^>]+name="csrf-token"[^>]+content="([^"]+)"/)
  const token = loginCsrf?.[1] ?? csrf
  log.push(`login page: HTTP ${loginPageRes.status} len=${loginPageHtml.length} token=${token.slice(0, 20)}`)

  // Extract login form fields
  const formFields = [...loginPageHtml.matchAll(/<input[^>]+name="([^"]+)"/gi)].map(m => m[1])
  log.push(`form fields: ${formFields.join(', ')}`)

  // Step 3: try login with various approaches
  const cookieHeader = [homeCookies, loginCookies].filter(Boolean).map(c => c.split(';')[0]).join('; ')

  // Try form POST
  for (const [emailField, userVal] of [['email', username], ['username', username], ['login', username]] as [string, string][]) {
    const body = new URLSearchParams({ [emailField]: userVal, password, _token: token })
    const r = await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: {
        ...BROWSER,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${BASE}/login`,
        Cookie: cookieHeader,
      },
      body: body.toString(),
      redirect: 'manual',
    })
    const resp = await r.text()
    const loc = r.headers.get('location') ?? ''
    const setCookie = r.headers.get('set-cookie') ?? ''
    log.push(`POST /login (${emailField}): HTTP ${r.status} loc=${loc} cookie=${setCookie.slice(0, 60)} body=${resp.slice(0, 100)}`)
    if (r.status >= 200 && r.status < 400 && setCookie) {
      log.push('*** login appears successful ***')
      break
    }
  }

  return Response.json({ name: 'obg-edge', log, loginPageSnippet: loginPageHtml.slice(0, 3000), loginSection })
}
