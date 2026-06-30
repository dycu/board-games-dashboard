import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BASE = 'https://hansa-teutonica-digital.onrender.com'

export async function GET() {
  const userId = process.env.HANSA_USER_ID

  const log: string[] = []
  log.push(`HANSA_USER_ID present: ${!!userId}`)
  log.push(`HANSA_USER_ID value: ${userId ?? '(none)'}`)

  if (!userId) {
    return NextResponse.json({ error: 'HANSA_USER_ID not set', log }, { status: 500 })
  }

  const myId = userId.replace(/-/g, '')
  log.push(`myId (no dashes): ${myId}`)

  try {
    const url = `${BASE}/games?limit=100&mode=all&status=playing`
    const res = await fetch(url)
    log.push(`games API: HTTP ${res.status}`)
    if (!res.ok) {
      return NextResponse.json({ error: `games API HTTP ${res.status}`, log }, { status: 500 })
    }

    const data = await res.json() as { games: any[]; nextCursor: string | null }
    log.push(`total games returned: ${data.games.length}`)

    const myGames = data.games.filter((g: any) =>
      g.players?.some((p: any) => p.userId?.replace(/-/g, '') === myId)
    )
    log.push(`games matching userId: ${myGames.length}`)

    return NextResponse.json({
      ok: true,
      log,
      matchedGames: myGames.map((g: any) => ({
        id: g.id,
        status: g.status,
        currentPlayerId: g.currentPlayerId,
        myTurn: g.currentPlayerId === myId,
        players: g.players,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500), log }, { status: 500 })
  }
}
