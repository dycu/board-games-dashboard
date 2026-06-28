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
    const initCookieRaw = initRes.headers.get('set-cookie') ?? ''
    const sessionCookie = initCookieRaw.split(';')[0]
    log.push(`init: HTTP ${initRes.status} cookie=${sessionCookie.slice(0, 40)}`)

    // Step 2: login via WCF JSON service
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
    let loginData: any
    try { loginData = JSON.parse(loginText) } catch { loginData = null }
    const authCookieRaw = loginRes.headers.get('set-cookie') ?? ''
    const authCookie = authCookieRaw.split(';')[0]
    log.push(`login: HTTP ${loginRes.status} body=${loginText.slice(0, 100)} cookie=${authCookie.slice(0, 40)}`)

    if (!loginData?.d) {
      return NextResponse.json({ error: 'login failed', log, loginText: loginText.slice(0, 300) }, { status: 500 })
    }

    const cookies = [sessionCookie, authCookie].filter(Boolean).join('; ')

    // Step 3: probe WCF WSDL/help to find available endpoints
    const wsdlRes = await fetch(`${WCF}?wsdl`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cookies },
    })
    const wsdlText = await wsdlRes.text()
    log.push(`wsdl: HTTP ${wsdlRes.status} len=${wsdlText.length}`)
    // Extract operation names from WSDL
    const ops = [...wsdlText.matchAll(/name="([A-Za-z]+)"/g)].map(m => m[1])
    log.push(`wsdl ops: ${[...new Set(ops)].join(', ')}`)

    // Step 4: try multiple game-list endpoint names
    const endpoints = [
      'GetLiveGames',
      'GetMyGames',
      'GetActiveGames',
      'GetRunningGames',
      'GetCurrentGames',
      'GetWaitingGames',
      'GetUserGames',
      'GetMyTurnGames',
      'GetOverviewData',
      'GetGamesByUser',
    ]

    const endpointResults: Record<string, any> = {}
    for (const ep of endpoints) {
      try {
        const r = await fetch(`${WCF}/${ep}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json',
            Cookie: cookies,
            'User-Agent': 'Mozilla/5.0',
            Referer: `${BASE}/en/Overview`,
          },
          body: '{}',
          signal: AbortSignal.timeout(8000),
        })
        const txt = await r.text()
        endpointResults[ep] = { status: r.status, body: txt.slice(0, 300) }
      } catch (e: any) {
        endpointResults[ep] = { error: e.message }
      }
    }

    // Step 5: try fetching the overview HTML page directly to understand structure
    const overviewRes = await fetch(`${BASE}/en/Overview`, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html',
        Cookie: cookies,
      },
    })
    const overviewHtml = await overviewRes.text()
    // Look for JS calls or data references to understand game data structure
    const scriptMatches = [...overviewHtml.matchAll(/GetLiveGames|GetMyGames|GetActive|YucataService|svc\//g)]
      .map(m => m[0])
    log.push(`overview: HTTP ${overviewRes.status} len=${overviewHtml.length} matches=${scriptMatches.join(',')}`)

    // Extract any inline JSON-looking game data from the HTML
    const gameDataMatch = overviewHtml.match(/Games\s*[:=]\s*(\[.{0,500})/s)
    const inlineData = gameDataMatch ? gameDataMatch[1].slice(0, 300) : null

    return NextResponse.json({ log, endpointResults, inlineData, wsdlSnippet: wsdlText.slice(0, 500) })
  } catch (e) {
    return NextResponse.json({ error: String(e), log }, { status: 500 })
  }
}
