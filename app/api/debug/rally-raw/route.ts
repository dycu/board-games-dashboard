import { fetchRally } from '@/lib/connectors/rally'
import WebSocket from 'ws'

export const runtime = 'nodejs'

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

function fetchState(wsUrl: string, cookie: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers: { Cookie: cookie, 'User-Agent': HEADERS['User-Agent'] } })
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout waiting for state message')) }, 8000)
    ws.on('message', (data: Buffer) => {
      try {
        const [cmd, arg] = JSON.parse(data.toString())
        if (cmd === 'state') {
          clearTimeout(timer)
          ws.close()
          resolve(arg)
        }
      } catch (e) { /* ignore parse errors on other messages */ }
    })
    ws.on('error', e => { clearTimeout(timer); reject(e) })
  })
}

export async function GET() {
  const username = process.env.RALLY_USERNAME ?? ''
  const password = process.env.RALLY_PASSWORD ?? ''

  const games = await fetchRally(username, password)
  const mariaGame = games.find(g => g.gameName === 'Maria')
  if (!mariaGame) return Response.json({ error: 'Maria game not found this time', games: games.map(g => g.gameName) })

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

  const url = new URL(mariaGame.gameUrl)
  const titleId = url.pathname.split('/').filter(Boolean)[0]
  const gameId = url.searchParams.get('game')
  const role = url.searchParams.get('role')
  const wsUrl = `wss://rally-the-troops.com/play-socket?title=${titleId}&game=${gameId}&role=${encodeURIComponent(role ?? '')}&seen=0&hash=2166136261`

  try {
    const view = await fetchState(wsUrl, cookie)
    return Response.json({ wsUrl, view })
  } catch (e) {
    return Response.json({ wsUrl, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
