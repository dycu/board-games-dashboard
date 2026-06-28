import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
export const runtime = 'edge'

const API = 'https://api.choochoo.games'
const ORIGIN = 'https://www.choochoo.games'

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': ORIGIN,
  'Referer': `${ORIGIN}/login`,
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
}

async function req(url: string, opts?: RequestInit): Promise<string> {
  try {
    const r = await fetch(url, { ...opts, headers: { ...BROWSER, ...(opts?.headers ?? {}) }, signal: AbortSignal.timeout(8000) })
    const body = await r.text()
    return `HTTP ${r.status} set-cookie=${r.headers.get('set-cookie')?.slice(0, 60) ?? 'none'} body=${body.slice(0, 200)}`
  } catch (e: any) {
    return `FAIL: ${e.name} | ${e.message} | cause=${JSON.stringify(e.cause?.message)}`
  }
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' })

  const body = JSON.stringify({ usernameOrEmail: username, password })
  const ct = { 'Content-Type': 'application/json' }

  const [ping, login] = await Promise.all([
    req(API),
    req(`${API}/users/login`, { method: 'POST', headers: ct, body }),
  ])

  return NextResponse.json({ ping, login })
}
