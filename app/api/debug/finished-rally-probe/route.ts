import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BASE = 'https://rally-the-troops.com'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*',
}

interface AltchaChallenge { algorithm: string; challenge: string; maxnumber: number; salt: string; signature: string }
const ENC = new TextEncoder()
async function solveAltcha(ch: AltchaChallenge): Promise<string> {
  for (let n = 0; n <= ch.maxnumber; n++) {
    const buf = await crypto.subtle.digest('SHA-256', ENC.encode(ch.salt + String(n)))
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    if (hex === ch.challenge) return btoa(JSON.stringify({ algorithm: ch.algorithm, challenge: ch.challenge, number: n, salt: ch.salt, signature: ch.signature }))
  }
  throw new Error('ALTCHA unsolvable')
}

export async function GET() {
  const username = process.env.RALLY_USERNAME
  const password = process.env.RALLY_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const log: string[] = []
  try {
    const challenge: AltchaChallenge = await (await fetch(`${BASE}/altcha-challenge`)).json()
    const altcha = await solveAltcha(challenge)
    log.push('ALTCHA solved')

    const loginRes = await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password, altcha }),
      redirect: 'manual',
    })
    if (loginRes.status !== 302) return NextResponse.json({ error: `login HTTP ${loginRes.status}`, log }, { status: 500 })
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
    log.push('login ok')

    // Check /games/finished
    const finishedRes = await fetch(`${BASE}/games/finished`, { headers: { ...HEADERS, Cookie: cookie } })
    log.push(`/games/finished HTTP ${finishedRes.status}`)
    const finishedHtml = finishedRes.ok ? await finishedRes.text() : ''

    const finishedSections = (finishedHtml.match(/<h2>[^<]+<\/h2>/g) ?? [])
    log.push(`/games/finished sections: ${JSON.stringify(finishedSections)}`)
    log.push(`/games/finished game_item count: ${(finishedHtml.match(/class="[^"]*\bgame_item\b/g) ?? []).length}`)

    // Also check /games/active for a Finished section there
    const activeRes = await fetch(`${BASE}/games/active`, { headers: { ...HEADERS, Cookie: cookie } })
    log.push(`/games/active HTTP ${activeRes.status}`)
    const activeHtml = activeRes.ok ? await activeRes.text() : ''

    const activeSections = (activeHtml.match(/<h2>[^<]+<\/h2>/g) ?? [])
    log.push(`/games/active sections: ${JSON.stringify(activeSections)}`)

    // Check what the finished page looks like
    const finishedPreview = finishedHtml.slice(0, 1500)

    return NextResponse.json({ log, finishedPreview, redirectedTo: finishedRes.url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
