import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BASE = 'https://18xx.games'

export async function GET() {
  const username = process.env.EIGHTEENXX_USERNAME
  const password = process.env.EIGHTEENXX_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'creds not set' }, { status: 500 })

  const log: string[] = []
  try {
    const loginRes = await fetch(`${BASE}/api/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: username, password }),
    })
    if (!loginRes.ok) return NextResponse.json({ error: `login HTTP ${loginRes.status}`, log }, { status: 500 })
    const loginData = await loginRes.json()
    const myId: number = loginData.user?.id
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
    log.push(`myId: ${myId}, cookie length: ${cookie.length}`)

    const gamesRes = await fetch(`${BASE}/api/game/user`, {
      headers: { Cookie: cookie, Accept: 'application/json' },
    })
    if (!gamesRes.ok) return NextResponse.json({ error: `games HTTP ${gamesRes.status}`, log }, { status: 500 })

    const data = await gamesRes.json()
    const games: any[] = Array.isArray(data) ? data : data.games ?? []
    log.push(`total games returned: ${games.length}`)

    // Show all unique statuses in the response
    const statuses = [...new Set(games.map((g: any) => g.status))]
    log.push(`unique statuses: ${JSON.stringify(statuses)}`)

    const myGames = games.filter((g: any) => (g.players ?? []).some((p: any) => p.id === myId))
    log.push(`my games: ${myGames.length}`)

    const myStatuses = [...new Set(myGames.map((g: any) => g.status))]
    log.push(`my game statuses: ${JSON.stringify(myStatuses)}`)

    const finished = myGames.filter((g: any) => g.status !== 'active')
    log.push(`my finished games (status != active): ${finished.length}`)

    // Try fetching a specific archive endpoint
    const archiveRes = await fetch(`${BASE}/api/game/user?finished=true`, {
      headers: { Cookie: cookie, Accept: 'application/json' },
    })
    log.push(`/api/game/user?finished=true HTTP ${archiveRes.status}`)
    if (archiveRes.ok) {
      const archiveData = await archiveRes.json()
      const archiveGames: any[] = Array.isArray(archiveData) ? archiveData : archiveData.games ?? []
      log.push(`games with ?finished=true: ${archiveGames.length}`)
    }

    return NextResponse.json({ log, sampleGame: myGames[0] ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 })
  }
}
