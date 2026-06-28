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

  try {
    // Step 1: get ASP.NET session cookie
    const initRes = await fetch(`${BASE}/en`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      redirect: 'manual',
    })
    const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''
    log.push(`init: HTTP ${initRes.status} cookie=${sessionCookie.slice(0, 50)}`)

    // Step 2: login via WCF JSON
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
    const loginText = await loginRes.text()
    const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
    log.push(`login: HTTP ${loginRes.status} body=${loginText.slice(0, 100)} cookie=${authCookie.slice(0, 50)}`)

    let loginData: any
    try { loginData = JSON.parse(loginText) } catch { loginData = null }
    if (!loginData?.d) {
      return NextResponse.json({ error: 'login failed', log }, { status: 500 })
    }

    const cookies = [sessionCookie, authCookie].filter(Boolean).join('; ')

    // Step 3: call GetCurrentGames
    const gamesRes = await fetch(`${WCF}/GetCurrentGames`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
        Cookie: cookies,
        'User-Agent': 'Mozilla/5.0',
        Referer: `${BASE}/en/CurrentGames`,
      },
      body: '{}',
    })
    const gamesText = await gamesRes.text()
    log.push(`GetCurrentGames: HTTP ${gamesRes.status} body=${gamesText.slice(0, 500)}`)

    let gamesData: any
    try { gamesData = JSON.parse(gamesText) } catch { gamesData = null }

    const games: any[] = gamesData?.d?.Games ?? []
    const totalGames = gamesData?.d?.TotalGames
    const nextGame = gamesData?.d?.NextGameOnTurn

    // Sample first game's keys to verify field names
    const firstGame = games[0]
    const firstGameKeys = firstGame ? Object.keys(firstGame) : []
    const firstGameSample = firstGame ? JSON.stringify(firstGame).slice(0, 600) : null
    const firstGamePlayer = firstGame?.Players?.[0]
    const firstPlayerKeys = firstGamePlayer ? Object.keys(firstGamePlayer) : []

    return NextResponse.json({
      log,
      totalGames,
      nextGame,
      gameCount: games.length,
      firstGameKeys,
      firstGameSample,
      firstPlayerKeys,
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e), log }, { status: 500 })
  }
}
