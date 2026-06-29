import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BASE = 'https://www.yucata.de'
const WCF = `${BASE}/Services/YucataService.svc`

export async function GET() {
  const username = process.env.YUCATA_USERNAME
  const password = process.env.YUCATA_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const log: string[] = []
  try {
    const initRes = await fetch(`${BASE}/en`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, redirect: 'manual' })
    const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''

    const loginRes = await fetch(`${WCF}/AuthenticateViaAjax`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Cookie: sessionCookie, 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ login: username, password, remember: false }),
    })
    const loginData = await loginRes.json()
    if (!loginData.d) return NextResponse.json({ error: 'Yucata login failed', log }, { status: 500 })
    const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
    const cookies = [sessionCookie, authCookie].filter(Boolean).join('; ')
    log.push('login ok')

    // Try WCF methods that might return finished/historical games
    const attempts: any[] = []
    for (const method of [
      'GetFinishedGames',
      'GetArchivedGames',
      'GetGameHistory',
      'GetMyFinishedGames',
      'GetHistoricalGames',
      'GetCompletedGames',
    ]) {
      const r = await fetch(`${WCF}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Cookie: cookies, 'User-Agent': 'Mozilla/5.0', Referer: `${BASE}/en/Overview` },
        body: '{}',
      })
      let parsed: any = null
      const bodyText = await r.text()
      try { parsed = JSON.parse(bodyText) } catch {}
      const games = parsed?.d?.Games ?? parsed?.d ?? null
      attempts.push({
        method,
        status: r.status,
        hasGames: Array.isArray(games),
        gameCount: Array.isArray(games) ? games.length : null,
        preview: bodyText.slice(0, 200),
      })
    }

    // Also check the active games response to understand what fields exist
    const liveRes = await fetch(`${WCF}/GetLiveGames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Cookie: cookies, 'User-Agent': 'Mozilla/5.0', Referer: `${BASE}/en/Overview` },
      body: '{}',
    })
    const liveData = await liveRes.json()
    const liveGames: any[] = liveData.d?.Games ?? []
    const firstGame = liveGames[0]
    log.push(`GetLiveGames: ${liveGames.length} games`)
    log.push(`Sample game keys: ${firstGame ? Object.keys(firstGame).join(', ') : 'none'}`)

    return NextResponse.json({ log, attempts, sampleLiveGame: firstGame ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
