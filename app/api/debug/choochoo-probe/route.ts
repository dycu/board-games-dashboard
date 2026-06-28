import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
export const runtime = 'edge'

async function req(url: string, opts?: RequestInit): Promise<string> {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(6000) })
    const body = await r.text()
    return `HTTP ${r.status} | cookies=${r.headers.get('set-cookie')?.slice(0, 60) ?? 'none'} | ${body.slice(0, 200)}`
  } catch (e: any) {
    return `ERROR: ${e.constructor?.name} ${e.message} cause=${JSON.stringify(e.cause)}`
  }
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME
  const password = process.env.CHOOCHOO_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' })

  const loginBody = JSON.stringify({ usernameOrEmail: username, password })
  const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }

  const results = await Promise.all([
    req('https://api.choochoo.games').then(r => ['https ping', r]),
    req('http://api.choochoo.games').then(r => ['http ping', r]),
    req('https://api.choochoo.games/users/login', { method: 'POST', headers: jsonHeaders, body: loginBody }).then(r => ['https login', r]),
    req('http://api.choochoo.games/users/login', { method: 'POST', headers: jsonHeaders, body: loginBody }).then(r => ['http login', r]),
  ])

  return NextResponse.json(Object.fromEntries(results))
}
