import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BASE = 'https://rally-the-troops.com'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*',
}

export async function GET() {
  const username = process.env.RALLY_USERNAME
  const password = process.env.RALLY_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'RALLY_USERNAME / RALLY_PASSWORD not set' }, { status: 500 })
  }

  const log: string[] = []

  try {
    // Step 1: ALTCHA challenge
    const chRes = await fetch(`${BASE}/altcha-challenge`, { headers: HEADERS })
    log.push(`altcha-challenge: HTTP ${chRes.status}`)
    if (!chRes.ok) {
      const body = await chRes.text()
      return NextResponse.json({ error: 'altcha-challenge failed', log, body: body.slice(0, 300) }, { status: 500 })
    }
    const challenge = await chRes.json() as any
    log.push(`challenge: algorithm=${challenge.algorithm} maxnumber=${challenge.maxnumber} salt=${challenge.salt}`)

    // Step 2: solve ALTCHA (inline crypto.subtle — just check the challenge looks solvable)
    if (challenge.maxnumber > 200_000) {
      log.push(`WARNING: maxnumber=${challenge.maxnumber} is very high, solving may time out`)
    }

    // Use Web Crypto to solve (same as what the connector does, but async here for probing)
    const enc = new TextEncoder()
    let solved = false
    let solvedN = -1
    for (let n = 0; n <= Math.min(challenge.maxnumber, 300_000); n++) {
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(challenge.salt + String(n)))
      const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
      if (hex === challenge.challenge) {
        solved = true
        solvedN = n
        break
      }
    }
    if (!solved) {
      return NextResponse.json({ error: 'ALTCHA unsolvable', log, challenge }, { status: 500 })
    }
    log.push(`ALTCHA solved: n=${solvedN}`)

    const altcha = btoa(JSON.stringify({
      algorithm: challenge.algorithm,
      challenge: challenge.challenge,
      number: solvedN,
      salt: challenge.salt,
      signature: challenge.signature,
    }))

    // Step 3: login
    const loginRes = await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password, altcha }),
      redirect: 'manual',
    })
    log.push(`login: HTTP ${loginRes.status} location=${loginRes.headers.get('location')}`)

    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
    log.push(`cookie: ${cookie ? cookie.slice(0, 30) + '...' : '(none)'}`)

    if (loginRes.status !== 302) {
      const body = await loginRes.text()
      return NextResponse.json({ error: `login returned HTTP ${loginRes.status} (expected 302)`, log, body: body.slice(0, 500) }, { status: 500 })
    }
    if (!cookie) {
      return NextResponse.json({ error: 'login succeeded (302) but no session cookie', log }, { status: 500 })
    }

    // Step 4: fetch active games page
    const gamesRes = await fetch(`${BASE}/games/active`, {
      headers: { ...HEADERS, Cookie: cookie },
    })
    log.push(`games/active: HTTP ${gamesRes.status}`)
    if (!gamesRes.ok) {
      const body = await gamesRes.text()
      return NextResponse.json({ error: `games/active HTTP ${gamesRes.status}`, log, body: body.slice(0, 500) }, { status: 500 })
    }

    const html = await gamesRes.text()
    const hasMoveSection = html.includes('<h2>Move</h2>')
    const hasActiveSection = html.includes('<h2>Active</h2>')
    const gameItemCount = (html.match(/class="[^"]*\bgame_item\b/g) ?? []).length

    log.push(`HTML length: ${html.length}`)
    log.push(`Has <h2>Move</h2>: ${hasMoveSection}`)
    log.push(`Has <h2>Active</h2>: ${hasActiveSection}`)
    log.push(`game_item divs found: ${gameItemCount}`)

    return NextResponse.json({ ok: true, log, htmlPreview: html.slice(0, 800) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500), log }, { status: 500 })
  }
}
