import { fetchRally } from '@/lib/connectors/rally'

const BASE = 'https://rally-the-troops.com'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*',
}

interface AltchaChallenge { algorithm: string; challenge: string; maxnumber: number; salt: string; signature: string }
const ALTCHA_ENC = new TextEncoder()
const ALTCHA_BATCH = 200
async function solveAltcha(ch: AltchaChallenge): Promise<string> {
  for (let base = 0; base <= ch.maxnumber; base += ALTCHA_BATCH) {
    const size = Math.min(ALTCHA_BATCH, ch.maxnumber - base + 1)
    const hashes = await Promise.all(Array.from({ length: size }, async (_, i) => {
      const n = base + i
      const buf = await crypto.subtle.digest('SHA-256', ALTCHA_ENC.encode(ch.salt + String(n)))
      const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
      return { n, hex }
    }))
    const hit = hashes.find(h => h.hex === ch.challenge)
    if (hit) return btoa(JSON.stringify({ algorithm: ch.algorithm, challenge: ch.challenge, number: hit.n, salt: ch.salt, signature: ch.signature }))
  }
  throw new Error('unsolvable')
}

export async function GET() {
  const username = process.env.RALLY_USERNAME ?? ''
  const password = process.env.RALLY_PASSWORD ?? ''

  const games = await fetchRally(username, password)
  if (games.length === 0) return Response.json({ error: 'no active rally games found' })

  const chRes = await fetch(`${BASE}/altcha-challenge`)
  const challenge: AltchaChallenge = await chRes.json()
  const altcha = await solveAltcha(challenge)
  const loginRes = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, altcha }),
    redirect: 'manual',
  })
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''

  const results = []
  for (const g of games.slice(0, 3)) {
    const res = await fetch(g.gameUrl, { headers: { ...HEADERS, Cookie: cookie } })
    const html = await res.text()
    const broad = [...html.matchAll(/.{0,30}(round|turn|phase|era|propaganda|campaign|segment|scenario|deck)[a-z]*["'\s:>]{0,8}[\w#]*.{0,20}/gi)]
      .map(m => m[0])
    results.push({
      gameName: g.gameName, gameUrl: g.gameUrl, htmlLength: html.length,
      matches: [...new Set(broad)].slice(0, 25),
    })
  }

  return Response.json({ activeGamesCount: games.length, results })
}
