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

        // Step 1: Fetch the main JS bundle and search for API patterns
        const bundleRes = await fetch('https://www.yucata.de/bundles/mpscripts4', {
          headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0' },
        })
        const bundleJs = await bundleRes.text()
        log.push(`mpscripts4 bundle: HTTP ${bundleRes.status} len=${bundleJs.length}`)

        if (bundleRes.ok) {
          // Find all URL patterns in the JS
          const svcCalls = [...new Set([...bundleJs.matchAll(/YucataService\.svc\/(\w+)/g)].map(m => m[1]))]
          const ashxCalls = [...new Set([...bundleJs.matchAll(/['"](\/[^'"]*\.ashx[^'"]*)['"]/g)].map(m => m[1]))]
          const apiPaths = [...new Set([...bundleJs.matchAll(/url\s*:\s*['"]([^'"]{5,80})['"]/g)].map(m => m[1]))]
          const enPaths = [...new Set([...bundleJs.matchAll(/['"]\/en\/\w+\/\w+['"]/g)].map(m => m[0]))]
          log.push(`WCF svc methods: ${svcCalls.join(', ')}`)
          log.push(`ashx handlers: ${ashxCalls.join(', ')}`)
          log.push(`url: patterns: ${apiPaths.slice(0, 30).join(' | ')}`)
          log.push(`/en/X/Y paths: ${enPaths.slice(0, 30).join(' | ')}`)

          // Search specifically for "running" or "game" near API calls
          const runningCtx = [...bundleJs.matchAll(/.{0,80}[Rr]unning.{0,80}/g)].map(m => m[0]).slice(0, 10)
          const gameApiCtx = [...bundleJs.matchAll(/.{0,60}GetGame.{0,60}/g)].map(m => m[0]).slice(0, 10)
          log.push(`'running' contexts: ${runningCtx.join(' || ')}`)
          log.push(`'GetGame' contexts: ${gameApiCtx.join(' || ')}`)
        }

        // Step 2: Fetch the GetRunningGames endpoint (returned 200 len=1898)
        const grgRes = await fetch('https://www.yucata.de/en/Game/GetRunningGames', {
          method: 'POST',
          headers: {
            Cookie: combinedCookies,
            'User-Agent': 'Mozilla/5.0',
            'Content-Type': 'application/json',
            Accept: 'application/json, text/html, */*',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: '{}',
        })
        const grgBody = await grgRes.text()
        log.push(`GetRunningGames: HTTP ${grgRes.status} len=${grgBody.length} body=${grgBody.slice(0, 200)}`)

        // Step 3: Try Handlers with params
        const handlerEndpoints = [
          '/Handlers/GameHandler.ashx?action=GetRunningGames',
          '/Handlers/GameHandler.ashx?action=running',
          '/Handlers/GameHandler.ashx',
          '/Handlers/UserHandler.ashx?action=games',
          '/Handlers/UserHandler.ashx',
        ]
        for (const url of handlerEndpoints) {
          try {
            const r = await fetch(`https://www.yucata.de${url}`, {
              headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' },
            })
            const txt = await r.text()
            log.push(`GET ${url}: HTTP ${r.status} len=${txt.length} body=${txt.slice(0, 150)}`)
          } catch (e: any) {
            log.push(`${url}: error ${e.message}`)
          }
        }

        results.push({
          name: 'yucata',
          log,
          getRunningGamesBody: grgBody.slice(0, 6000),
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
