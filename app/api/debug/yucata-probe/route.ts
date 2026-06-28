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

  // Step 1: get ASP.NET session cookie
  const initRes = await fetch(`${BASE}/en`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    redirect: 'manual',
  })
  const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  log.push(`init: HTTP ${initRes.status} cookie=${sessionCookie.slice(0, 50)}`)

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
  const loginText = await loginRes.text()
  const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  log.push(`login: HTTP ${loginRes.status} body=${loginText.slice(0, 80)} cookie=${authCookie.slice(0, 50)}`)

  let loginData: any
  try { loginData = JSON.parse(loginText) } catch { loginData = null }
  if (!loginData?.d) {
    return NextResponse.json({ error: 'login failed', log }, { status: 500 })
  }

  const cookies = [sessionCookie, authCookie].filter(Boolean).join('; ')
  const baseHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json',
    Cookie: cookies,
    'User-Agent': 'Mozilla/5.0',
    Referer: `${BASE}/en/Overview`,
  }

  // Step 3: check WCF help page for available methods
  const helpRes = await fetch(`${WCF}/help`, {
    headers: { Cookie: cookies, 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  const helpText = helpRes ? await helpRes.text().catch(() => '') : ''
  log.push(`help: HTTP ${helpRes?.status} len=${helpText.length}`)
  // Extract method names from help page
  const helpOps = [...helpText.matchAll(/href="[^"]*\/([A-Za-z]+)"/g)].map(m => m[1])
  log.push(`help ops: ${[...new Set(helpOps)].join(', ')}`)

  // Step 4: try the Overview page to find API calls in HTML/JS
  const overviewRes = await fetch(`${BASE}/en/Overview`, {
    headers: { Cookie: cookies, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
  })
  const overviewHtml = await overviewRes.text()
  log.push(`overview: HTTP ${overviewRes.status} len=${overviewHtml.length}`)
  const wcfCalls = [...overviewHtml.matchAll(/YucataService\.svc\/([A-Za-z]+)/g)].map(m => m[1])
  const ajaxCalls = [...overviewHtml.matchAll(/['"]\/Services\/[^'"]+['"]/g)].map(m => m[0])
  log.push(`wcfCalls in HTML: ${[...new Set(wcfCalls)].join(', ')}`)
  log.push(`ajaxCalls in HTML: ${ajaxCalls.slice(0, 10).join(', ')}`)

  // Step 5: try every plausible endpoint name
  const candidates = [
    'GetCurrentGames',
    'GetLiveGames',
    'GetMyGames',
    'GetActiveGames',
    'GetRunningGames',
    'GetWaitingGames',
    'GetGames',
    'GetUserGames',
    'GetMyTurnGames',
    'GetOpenGames',
    'GetOverviewData',
    'GetGamesByUser',
    'GetGameList',
    'GetGameInfo',
    'GetPlayerGames',
    'GetInProgressGames',
    'GetAllGames',
  ]

  const endpointResults: Record<string, { status: number; body: string }> = {}
  await Promise.all(candidates.map(async ep => {
    try {
      const r = await fetch(`${WCF}/${ep}`, {
        method: 'POST',
        headers: baseHeaders,
        body: '{}',
        signal: AbortSignal.timeout(8000),
      })
      const txt = await r.text()
      endpointResults[ep] = { status: r.status, body: txt.slice(0, 200) }
    } catch (e: any) {
      endpointResults[ep] = { status: 0, body: e.message }
    }
  }))

  // Show which ones didn't 404
  const working = Object.entries(endpointResults)
    .filter(([, v]) => v.status !== 404 && v.status !== 0)
    .map(([k, v]) => `${k}: ${v.status} ${v.body.slice(0, 100)}`)

  return NextResponse.json({ log, working, endpointResults })
}
