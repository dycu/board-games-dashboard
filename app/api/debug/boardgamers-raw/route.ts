import { kv } from '@vercel/kv'

// Temporary: inspect the raw boardgamers.space game JSON for an avatar/
// image field not captured by the typed BoardgamersPlayer interface.
// Delete after use.
const BASE = 'https://boardgamers.space'
const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' }

export async function GET() {
  const email = process.env.BOARDGAMERS_USERNAME ?? ''
  const password = process.env.BOARDGAMERS_PASSWORD ?? ''
  const cached = await kv.get<{ cookie: string; userId: string }>('boardgamers-session').catch(() => null)
  let session = cached
  if (!session) {
    const res = await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { ...BROWSER, 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE, Referer: `${BASE}/login` },
      body: new URLSearchParams({ redirect: '/login', email, password }),
      redirect: 'manual',
    })
    const setCookie = res.headers.get('set-cookie') ?? ''
    const cookie = setCookie.split(/,(?=\s*[A-Za-z0-9_-]+=)/).map(c => c.split(';')[0].trim()).filter(c => c.includes('=')).join('; ')
    const accountRes = await fetch(`${BASE}/api/account`, { headers: { ...BROWSER, Cookie: cookie } })
    const account = await accountRes.json() as { _id?: string }
    session = { cookie, userId: account._id ?? '' }
  }
  const res = await fetch(`${BASE}/api/game/status/active?user=${session.userId}&count=5&skip=0`, {
    headers: { ...BROWSER, Cookie: session.cookie },
  })
  const games = await res.json()
  return Response.json({ games })
}
