import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BASE = 'https://18xx.games'

export async function GET() {
  const username = process.env.EIGHTEENXX_USERNAME
  const password = process.env.EIGHTEENXX_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'EIGHTEENXX_USERNAME / EIGHTEENXX_PASSWORD not set' }, { status: 500 })
  }

  const log: string[] = []

  // Try multiple login field name variants
  const loginVariants = [
    { login: username, password },
    { username, password },
    { email: username, password },
  ]

  for (const body of loginVariants) {
    log.push(`Trying login body: ${JSON.stringify(body).replace(password, '***')}`)
    const loginRes = await fetch(`${BASE}/api/user/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify(body),
    })
    const loginText = await loginRes.text()
    log.push(`  HTTP ${loginRes.status} headers: ${JSON.stringify(Object.fromEntries(loginRes.headers.entries()))}`)
    log.push(`  Body: ${loginText.slice(0, 500)}`)

    if (loginRes.ok) {
      // Login succeeded — now try games endpoint
      const cookies = loginRes.headers.get('set-cookie') ?? ''
      const cookie = cookies.split(';')[0]
      log.push(`  Cookie: ${cookie}`)

      const gamesRes = await fetch(`${BASE}/api/game/user`, {
        headers: { Cookie: cookie, Accept: 'application/json' },
      })
      const gamesText = await gamesRes.text()
      log.push(`Games endpoint HTTP ${gamesRes.status}: ${gamesText.slice(0, 1000)}`)

      let gamesData: any
      try { gamesData = JSON.parse(gamesText) } catch {}

      return NextResponse.json({ success: true, loginBody: body, log, gamesData })
    }
  }

  return NextResponse.json({ success: false, log }, { status: 500 })
}
