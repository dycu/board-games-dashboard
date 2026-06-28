import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BASE = 'https://www.yucata.de'
const WCF = `${BASE}/Services/YucataService.svc`

export async function GET() {
  const username = process.env.YUCATA_USERNAME
  const password = process.env.YUCATA_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'YUCATA_USERNAME / YUCATA_PASSWORD not set' }, { status: 500 })
  }

  const log: string[] = []

  // Step 1: session cookie
  const initRes = await fetch(`${BASE}/en`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    redirect: 'manual',
  })
  const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  log.push(`init: HTTP ${initRes.status}`)

  // Step 2: login
  const loginRes = await fetch(`${WCF}/AuthenticateViaAjax`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      Cookie: sessionCookie,
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ login: username, password, remember: false }),
  })
  const loginData = await loginRes.json()
  const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  if (!loginData?.d) return NextResponse.json({ error: 'login failed', log }, { status: 500 })
  log.push(`login: OK`)

  const cookies = [sessionCookie, authCookie].filter(Boolean).join('; ')

  // Step 3: GetLiveGames — dump first game in full
  const gamesRes = await fetch(`${WCF}/GetLiveGames`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      Cookie: cookies,
      'User-Agent': 'Mozilla/5.0',
      Referer: `${BASE}/en/Overview`,
    },
    body: '{}',
  })
  const gamesData = await gamesRes.json()
  const games: any[] = gamesData.d?.Games ?? []
  log.push(`GetLiveGames: HTTP ${gamesRes.status} gameCount=${games.length}`)

  const firstGame = games[0] ?? null
  const firstGameKeys = firstGame ? Object.keys(firstGame) : []
  const firstPlayer = firstGame?.Players?.[0] ?? null
  const firstPlayerKeys = firstPlayer ? Object.keys(firstPlayer) : []

  // Show sample of first 3 games with all fields (no truncation on keys)
  const gameSamples = games.slice(0, 3).map((g: any) => ({
    ...g,
    Players: (g.Players ?? []).slice(0, 2), // limit players for readability
  }))

  return NextResponse.json({
    log,
    totalGames: games.length,
    firstGameKeys,
    firstPlayerKeys,
    gameSamples,
  })
}
