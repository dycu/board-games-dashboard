import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const results: any[] = []

  // ── YUCATA ──────────────────────────────────────────────────────────────
  {
    const username = process.env.YUCATA_USERNAME
    const password = process.env.YUCATA_PASSWORD
    if (!username || !password) {
      results.push({ name: 'yucata', error: 'no credentials' })
    } else {
      try {
        const log: string[] = []

        // Login
        const initRes = await fetch('https://www.yucata.de/en', {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,*/*' },
          redirect: 'manual',
        })
        const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''

        const loginRes = await fetch('https://www.yucata.de/Services/YucataService.svc/AuthenticateViaAjax', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json',
            Cookie: sessionCookie,
            'User-Agent': 'Mozilla/5.0',
          },
          body: JSON.stringify({ login: username, password, remember: false }),
        })
        const loginJson = await loginRes.json()
        const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
        if (!loginJson.d) {
          results.push({ name: 'yucata', error: 'login failed' })
          return NextResponse.json(results)
        }

        const combinedCookies = [sessionCookie, authCookie].filter(Boolean).join('; ')

        // Get full lobby page and extract JS bundle URL from the tail
        const lobbyRes = await fetch('https://www.yucata.de/en/Overview', {
          headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
        })
        const lobbyHtml = await lobbyRes.text()
        log.push(`lobby: HTTP ${lobbyRes.status} len=${lobbyHtml.length}`)

        // Find script bundle in lobby tail
        const lobbyTail = lobbyHtml.slice(-8000)
        const scriptMatches = [...lobbyTail.matchAll(/src="(\/bundles\/[^"]+)"/g)].map(m => m[1])
        const scriptTags = [...lobbyTail.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1])
        log.push(`script bundles in tail: ${scriptMatches.join(', ')}`)
        log.push(`all script src in tail: ${scriptTags.join(', ')}`)

        // Also search full page for script bundle
        const allScriptMatches = [...lobbyHtml.matchAll(/src="(\/bundles\/[^"]+)"/g)].map(m => m[1])
        log.push(`all script bundles: ${allScriptMatches.join(', ')}`)

        // WCF service with userHash from page
        const userHashMatch = lobbyHtml.match(/var UserHash\s*=\s*'([A-F0-9]+)'/)
        const userHash = userHashMatch?.[1] ?? ''
        const userIdMatch = lobbyHtml.match(/var UserID\s*=\s*'(\d+)'/)
        const userId = userIdMatch?.[1] ?? ''

        // Try the JS bundle directly (guessing the bundle name)
        for (const bundleName of ['y4scripts', 'y4app', 'y4main', 'scripts', 'app']) {
          try {
            const r = await fetch(`https://www.yucata.de/bundles/${bundleName}`, {
              headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0' },
            })
            const txt = await r.text()
            log.push(`bundle /${bundleName}: HTTP ${r.status} len=${txt.length}`)
            if (r.ok && txt.length > 1000) {
              // Search for WCF/API patterns
              const svcCalls = [...txt.matchAll(/YucataService\.svc\/(\w+)/g)].map(m => m[1])
              const ajaxCalls = [...txt.matchAll(/["'](\/(?:Services|api|en\/\w+)[^"']{0,80})["']/g)].map(m => m[1])
              log.push(`  WCF methods found: ${[...new Set(svcCalls)].join(', ')}`)
              log.push(`  Ajax patterns: ${ajaxCalls.slice(0, 20).join(' | ')}`)
              break
            }
          } catch (e: any) {
            log.push(`bundle /${bundleName}: error ${e.message}`)
          }
        }

        // Try known Yucata API patterns - handler-style endpoints common in ASP.NET
        const endpoints = [
          { url: '/en/Overview/GetRunningGames', method: 'POST', body: '{}' },
          { url: '/en/Overview/GetGames', method: 'POST', body: '{}' },
          { url: '/en/Game/GetRunningGames', method: 'POST', body: '{}' },
          { url: '/en/Home/GetRunningGames', method: 'POST', body: '{}' },
          { url: `/en/User/GetRunningGames?userHash=${userHash}`, method: 'GET', body: '' },
          { url: '/Handlers/GameHandler.ashx', method: 'GET', body: '' },
          { url: '/Handlers/UserHandler.ashx', method: 'GET', body: '' },
        ]
        for (const { url, method, body } of endpoints) {
          try {
            const r = await fetch(`https://www.yucata.de${url}`, {
              method,
              headers: {
                Cookie: combinedCookies,
                'User-Agent': 'Mozilla/5.0',
                'Content-Type': 'application/json',
                Accept: 'application/json, text/html',
                'X-Requested-With': 'XMLHttpRequest',
              },
              ...(body ? { body } : {}),
            })
            const txt = await r.text()
            log.push(`${method} ${url}: HTTP ${r.status} len=${txt.length} body=${txt.slice(0, 100)}`)
          } catch (e: any) {
            log.push(`${url}: error ${e.message}`)
          }
        }

        results.push({
          name: 'yucata',
          log,
          userId,
          lobbyTail: lobbyTail.slice(0, 4000),
        })
      } catch (e: any) {
        results.push({ name: 'yucata', error: e.message })
      }
    }
  }

  // ── CHOOCHOO ─────────────────────────────────────────────────────────────
  {
    results.push({ name: 'choochoo', error: 'network unreachable from Vercel' })
  }

  return NextResponse.json(results)
}
