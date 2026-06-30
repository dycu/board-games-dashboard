import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BASE = 'https://hansa-teutonica-digital.onrender.com'

export async function GET() {
  const username = process.env.HANSA_USERNAME

  const log: string[] = []
  log.push(`HANSA_USERNAME present: ${!!username}`)
  log.push(`HANSA_USERNAME length: ${username?.length ?? 0}`)
  log.push(`HANSA_USERNAME bytes: ${username ? [...username].map(c => c.codePointAt(0)?.toString(16)).join(' ') : '(none)'}`)

  if (!username) {
    return NextResponse.json({ error: 'HANSA_USERNAME not set', log }, { status: 500 })
  }

  try {
    const url = `${BASE}/games?limit=100&mode=all&status=playing`
    const res = await fetch(url)
    log.push(`games API: HTTP ${res.status}`)
    if (!res.ok) {
      return NextResponse.json({ error: `games API HTTP ${res.status}`, log }, { status: 500 })
    }

    const data = await res.json() as { games: any[]; nextCursor: string | null }
    log.push(`total games returned: ${data.games.length}`)
    log.push(`nextCursor: ${data.nextCursor}`)

    const myGames = data.games.filter((g: any) =>
      g.players?.some((p: any) => p.name === username)
    )
    log.push(`games matching username: ${myGames.length}`)

    // Show all unique player names for inspection
    const allNames = [...new Set(data.games.flatMap((g: any) => g.players?.map((p: any) => p.name) ?? []))]
    const namesWithBytes = allNames.map(n => ({
      name: n,
      bytes: [...n].map(c => c.codePointAt(0)?.toString(16)).join(' '),
    }))

    return NextResponse.json({
      ok: true,
      log,
      matchedGames: myGames.map((g: any) => ({
        id: g.id,
        status: g.status,
        currentPlayerId: g.currentPlayerId,
        players: g.players,
      })),
      allPlayerNames: namesWithBytes,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500), log }, { status: 500 })
  }
}
