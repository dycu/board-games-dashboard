const BASE = 'https://rally-the-troops.com'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*',
}
const ALTCHA_ENC = new TextEncoder()

async function solveAltcha(ch: { algorithm: string; challenge: string; maxnumber: number; salt: string; signature: string }): Promise<string> {
  for (let n = 0; n <= ch.maxnumber; n++) {
    const buf = await crypto.subtle.digest('SHA-256', ALTCHA_ENC.encode(ch.salt + String(n)))
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    if (hex === ch.challenge) {
      return btoa(JSON.stringify({ algorithm: ch.algorithm, challenge: ch.challenge, number: n, salt: ch.salt, signature: ch.signature }))
    }
  }
  throw new Error('unsolvable')
}

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const username = process.env.RALLY_USERNAME ?? ''
  const password = process.env.RALLY_PASSWORD ?? ''
  const chRes = await fetch(`${BASE}/altcha-challenge`)
  const challenge = await chRes.json()
  const altcha = await solveAltcha(challenge)
  const loginRes = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, altcha }),
    redirect: 'manual',
  })
  if (loginRes.status !== 302) return Response.json({ error: 'login failed', status: loginRes.status })
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''

  const gamesRes = await fetch(`${BASE}/games/active`, { headers: { ...HEADERS, Cookie: cookie } })
  const html = await gamesRes.text()
  return Response.json({ html })
}
