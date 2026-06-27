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
        log.push(`login: ${JSON.stringify(loginJson)}, authLen=${authCookie.length}`)

        if (!loginJson.d) {
          results.push({ name: 'yucata', error: 'login failed', log })
          return NextResponse.json(results)
        }

        const combinedCookies = [sessionCookie, authCookie].filter(Boolean).join('; ')

        // Step 3: get user ID from /en page
        const homeRes = await fetch('https://www.yucata.de/en', {
          headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
        })
        const homeHtml = await homeRes.text()
        const userIdMatch = homeHtml.match(/var UserID\s*=\s*'(\d+)'/)
        const userHashMatch = homeHtml.match(/var UserHash\s*=\s*'([A-F0-9]+)'/)
        const userId = userIdMatch?.[1] ?? ''
        const userHash = userHashMatch?.[1] ?? ''
        log.push(`userId=${userId}, userHash=${userHash.slice(0, 8)}...`)

        // Step 4: try WCF service methods with user ID
        const wcfBase = 'https://www.yucata.de/Services/YucataService.svc'
        const wcfMethods = [
          { name: 'GetRunningGames', body: {} },
          { name: 'GetRunningGames', body: { userID: parseInt(userId) } },
          { name: 'GetRunningGamesForUser', body: { userID: parseInt(userId) } },
          { name: 'GetGamesForUser', body: { userID: parseInt(userId) } },
          { name: 'GetOpenGames', body: {} },
          { name: 'GetOpenGamesForUser', body: { userID: parseInt(userId) } },
          { name: 'GetMyGames', body: { userHash } },
          { name: 'GetUserRunningGames', body: { userID: parseInt(userId) } },
        ]
        for (const { name, body } of wcfMethods) {
          try {
            const r = await fetch(`${wcfBase}/${name}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                Accept: 'application/json',
                Cookie: combinedCookies,
                'User-Agent': 'Mozilla/5.0',
              },
              body: JSON.stringify(body),
            })
            const txt = await r.text()
            log.push(`WCF ${name}(${JSON.stringify(body)}): HTTP ${r.status} len=${txt.length} body=${txt.slice(0, 150)}`)
          } catch (e: any) {
            log.push(`WCF ${name}: error ${e.message}`)
          }
        }

        // Step 5: try WCF service help/metadata
        try {
          const helpR = await fetch(`${wcfBase}`, {
            headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
          })
          const helpTxt = await helpR.text()
          log.push(`WCF help: HTTP ${helpR.status} len=${helpTxt.length} body=${helpTxt.slice(0, 300)}`)
        } catch (e: any) {
          log.push(`WCF help: error ${e.message}`)
        }

        // Step 6: fetch /en/Overview (Lobby) full page
        const lobbyRes = await fetch('https://www.yucata.de/en/Overview', {
          headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
          redirect: 'manual',
        })
        const lobbyHtml = await lobbyRes.text()
        const lobbyLoc = lobbyRes.headers.get('location') ?? ''
        log.push(`/en/Overview: HTTP ${lobbyRes.status} loc=${lobbyLoc} len=${lobbyHtml.length}`)

        // Step 7: try user-specific game URLs
        const gameUrls = [
          `/en/User/${username}`,
          `/en/Profile`,
          `/en/MyGames`,
          `/en/RunningGames`,
          `/en/Game/Running`,
        ]
        for (const path of gameUrls) {
          try {
            const r = await fetch(`https://www.yucata.de${path}`, {
              headers: { Cookie: combinedCookies, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
              redirect: 'manual',
            })
            const txt = await r.text()
            const loc = r.headers.get('location') ?? ''
            log.push(`${path}: HTTP ${r.status} loc=${loc} len=${txt.length}`)
          } catch (e: any) {
            log.push(`${path}: error ${e.message}`)
          }
        }

        results.push({
          name: 'yucata',
          log,
          userId,
          lobbyStatus: lobbyRes.status,
          lobbyLen: lobbyHtml.length,
          lobbyHtml: lobbyHtml.slice(0, 8000),
        })
      } catch (e: any) {
        results.push({ name: 'yucata', error: e.message })
      }
    }
  }

  // ── CHOOCHOO ─────────────────────────────────────────────────────────────
  {
    results.push({ name: 'choochoo', error: 'network unreachable from Vercel — both api.choochoo.games and choochoo.games fail with fetch failed' })
  }

  return NextResponse.json(results)
}
