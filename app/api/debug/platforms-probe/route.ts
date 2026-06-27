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

        // Step 1: Full lobby HTML — get middle section (chars 3000-18000) to find game containers
        const lobbyRes = await fetch('https://www.yucata.de/en/Overview', {
          headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
        })
        const lobbyHtml = await lobbyRes.text()
        log.push(`lobby: HTTP ${lobbyRes.status} len=${lobbyHtml.length}`)

        // Step 2: Fetch JS bundle and do targeted searches
        const bundleRes = await fetch('https://www.yucata.de/bundles/mpscripts4', {
          headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0' },
        })
        const bundleJs = await bundleRes.text()
        log.push(`bundle: HTTP ${bundleRes.status} len=${bundleJs.length}`)

        // Find ALL BaseServiceCall invocations
        const allServiceCalls = [...new Set([...bundleJs.matchAll(/BaseServiceCall\(\s*["'](\w+)["']/g)].map(m => m[1]))]
        log.push(`All WCF methods: ${allServiceCalls.join(', ')}`)

        // Find any fetch/XMLHttpRequest/ajax calls with URLs
        const fetchUrls = [...bundleJs.matchAll(/fetch\(['"](\/[^'"]{3,80})['"]/g)].map(m => m[1])
        const xhrUrls = [...bundleJs.matchAll(/\.open\s*\(\s*["'](?:GET|POST)["']\s*,\s*["'](\/[^'"]{3,80})["']/g)].map(m => m[1])
        const ajaxUrls = [...bundleJs.matchAll(/\$\.(?:get|post|ajax)\s*\(\s*["'](\/[^'"]{3,80})["']/g)].map(m => m[1])
        log.push(`fetch URLs: ${fetchUrls.join(', ')}`)
        log.push(`XHR open URLs: ${xhrUrls.join(', ')}`)
        log.push(`jQuery ajax URLs: ${ajaxUrls.join(', ')}`)

        // Search around 'Overview' references in JS
        const overviewCtx = [...bundleJs.matchAll(/.{0,60}[Oo]verview.{0,60}/g)].map(m => m[0]).slice(0, 15)
        log.push(`Overview contexts: ${overviewCtx.join(' || ')}`)

        // Search for game loading patterns
        const gameLoadCtx = [...bundleJs.matchAll(/.{0,60}[Ll]oad[Gg]ame.{0,60}/g)].map(m => m[0]).slice(0, 10)
        log.push(`loadGame contexts: ${gameLoadCtx.join(' || ')}`)

        // Step 3: Try WCF GetGamesWithTags with different tag params
        for (const body of ['{}', '{"tags":"running"}', '{"tags":"active"}', '{"userID":1031968}']) {
          try {
            const r = await fetch('https://www.yucata.de/Services/YucataService.svc/GetGamesWithTags', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                Accept: 'application/json',
                Cookie: combinedCookies,
                'User-Agent': 'Mozilla/5.0',
              },
              body,
            })
            const txt = await r.text()
            log.push(`GetGamesWithTags(${body}): HTTP ${r.status} len=${txt.length} body=${txt.slice(0, 200)}`)
          } catch (e: any) {
            log.push(`GetGamesWithTags: error ${e.message}`)
          }
        }

        results.push({
          name: 'yucata',
          log,
          lobbyMiddle: lobbyHtml.slice(3000, 18000),
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
