import { withTimeout } from '@/lib/connectors/utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BASE = 'https://boardgamearena.com'
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}
const STEP_TIMEOUT_MS = 10_000

function parseCookies(headers: Headers): Record<string, string> {
  const cookies: Record<string, string> = {}
  const setCookieList = headers.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : [])
  for (const raw of setCookieList) {
    const [kv] = raw.split(';')
    const eq = kv.indexOf('=')
    if (eq > 0) cookies[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim()
  }
  return cookies
}
function cookieString(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}
function extractRequestToken(html: string): string {
  const m = html.match(/g_requestToken\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
           ?? html.match(/['"]request_token['"]\s*[=:]\s*['"]([a-f0-9]{32,64})['"]/i)
  return m ? m[m.length - 1] : ''
}

// Temporary: replicates lib/connectors/bga.ts's loginBGA step by step, each
// with its own 10s timeout, to find exactly which network call is hanging —
// the real connector has no per-step timeout, so a stuck step there just
// blocks until Vercel's own function-level kill. Protected by the app's own
// Basic Auth (middleware), not CRON_SECRET.
export async function GET(request: Request) {
  const dumpHtml = new URL(request.url).searchParams.has('dump')
  const username = process.env.BGA_USERNAME ?? ''
  const password = process.env.BGA_PASSWORD ?? ''
  const timings: Record<string, number> = {}
  const t0 = Date.now()

  try {
    const initRes = await withTimeout(fetch(`${BASE}/account`, {
      redirect: 'manual',
      headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*' },
    }), STEP_TIMEOUT_MS, 'step1-account')
    timings.step1_account = Date.now() - t0
    let cookies = parseCookies(initRes.headers)
    let loginBase = BASE

    if (initRes.status >= 300 && initRes.status < 400) {
      const location = initRes.headers.get('location') ?? ''
      if (location) {
        const t1 = Date.now()
        const redirectUrl = new URL(location.startsWith('http') ? location : `${BASE}${location}`)
        loginBase = redirectUrl.origin
        const followRes = await withTimeout(fetch(redirectUrl.href, {
          redirect: 'manual',
          headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*', Cookie: cookieString(cookies) },
        }), STEP_TIMEOUT_MS, 'step1b-redirect')
        timings.step1b_redirect = Date.now() - t1
        cookies = { ...cookies, ...parseCookies(followRes.headers) }
      }
    }

    const t2 = Date.now()
    const loginPageRes = await withTimeout(fetch(`${loginBase}/?page=login`, {
      headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*', Cookie: cookieString(cookies) },
    }), STEP_TIMEOUT_MS, 'step2-loginpage')
    timings.step2_loginpage = Date.now() - t2
    cookies = { ...cookies, ...parseCookies(loginPageRes.headers) }
    const loginPageHtml = await loginPageRes.text()
    const requestToken = extractRequestToken(loginPageHtml)
    if (!requestToken) {
      const tokenMentions = [...loginPageHtml.matchAll(/.{0,40}[Tt]oken.{0,80}/g)].slice(0, 10).map(m => m[0])
      return Response.json({
        timings, error: 'no request token', htmlLength: loginPageHtml.length, status: loginPageRes.status,
        cookies, loginBase, tokenMentions,
        html: dumpHtml ? loginPageHtml : undefined,
      })
    }

    const t3 = Date.now()
    const loginRes = await withTimeout(fetch(`${loginBase}/account/auth/loginUserWithPassword.html`, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: '*/*',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Request-Token': requestToken,
        Origin: loginBase,
        Referer: `${loginBase}/?step=2&page=login`,
        Cookie: cookieString(cookies),
      },
      body: new URLSearchParams({ username, password, remember_me: 'true', request_token: requestToken }),
    }), STEP_TIMEOUT_MS, 'step3-loginpost')
    timings.step3_loginpost = Date.now() - t3
    const loginText = await loginRes.text()

    return Response.json({ timings, totalMs: Date.now() - t0, loginStatus: loginRes.status, loginBodyPreview: loginText.slice(0, 200) })
  } catch (e) {
    return Response.json({ timings, totalMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) })
  }
}
