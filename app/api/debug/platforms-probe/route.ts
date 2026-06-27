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

        // Step 1: get session cookie
        const initRes = await fetch('https://www.yucata.de/en', {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,*/*' },
          redirect: 'manual',
        })
        const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''

        // Step 2: login
        const loginRes = await fetch('https://www.yucata.de/Services/YucataService.svc/AuthenticateViaAjax', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json',
            Cookie: sessionCookie,
            Referer: 'https://www.yucata.de/en',
            'User-Agent': 'Mozilla/5.0',
          },
          body: JSON.stringify({ login: username, password, remember: false }),
        })
        const loginJson = await loginRes.json()
        const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
        if (!loginJson.d) {
          results.push({ name: 'yucata', error: 'login failed', log })
          return NextResponse.json(results)
        }

        const combinedCookies = [sessionCookie, authCookie].filter(Boolean).join('; ')

        // Step 3: get WCF service help page to find real method names
        const helpRes = await fetch('https://www.yucata.de/Services/YucataService.svc', {
          headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
        })
        const helpHtml = await helpRes.text()
        log.push(`WCF help: HTTP ${helpRes.status} len=${helpHtml.length}`)

        // Extract method names from help HTML (they appear as links or in text)
        const methodMatches = [...helpHtml.matchAll(/href="([^"]+YucataService[^"]+)"/gi)]
          .map(m => m[1])
        const operationMatches = [...helpHtml.matchAll(/operation[^>]*>([^<]{3,60})</gi)]
          .map(m => m[1].trim())
        log.push(`WCF links: ${methodMatches.slice(0, 20).join(', ')}`)
        log.push(`WCF operations: ${operationMatches.slice(0, 20).join(', ')}`)

        // Step 4: get JS bundle to find API call patterns
        const bundleMatch = helpHtml.match(/\/bundles\/y4scripts\?v=([^"]+)"/)
          ?? helpHtml.match(/\/scripts\/([^"]+\.js)[^"]*"/)
        log.push(`bundle: ${bundleMatch?.[0] ?? 'not found'}`)

        // Try fetching the main JS bundle from the lobby page
        const lobbyRes = await fetch('https://www.yucata.de/en/Overview', {
          headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
        })
        const lobbyHtml = await lobbyRes.text()
        // Find script bundle URL
        const scriptBundleMatch = lobbyHtml.match(/src="(\/bundles\/y4scripts[^"]+)"/)
        const scriptBundleUrl = scriptBundleMatch?.[1] ?? ''
        log.push(`Script bundle: ${scriptBundleUrl}`)

        // Find any WCF method references in the lobby page
        const wcfRefs = [...lobbyHtml.matchAll(/YucataService\.svc\/(\w+)/g)].map(m => m[1])
        log.push(`WCF refs in lobby: ${wcfRefs.join(', ')}`)

        // Find any fetch/ajax patterns
        const ajaxRefs = [...lobbyHtml.matchAll(/['"]\/(?:Services|api|en)\/([^'"]{3,80})['"]/g)]
          .map(m => m[0]).slice(0, 20)
        log.push(`Ajax refs: ${ajaxRefs.join(' | ')}`)

        results.push({
          name: 'yucata',
          log,
          wcfHtml: helpHtml.slice(0, 8000),
          lobbyHtml: lobbyHtml.slice(0, 3000),
        })
      } catch (e: any) {
        results.push({ name: 'yucata', error: e.message })
      }
    }
  }

  // ── CHOOCHOO ─────────────────────────────────────────────────────────────
  {
    results.push({ name: 'choochoo', error: 'network unreachable from Vercel — api.choochoo.games and choochoo.games both fail' })
  }

  return NextResponse.json(results)
}
