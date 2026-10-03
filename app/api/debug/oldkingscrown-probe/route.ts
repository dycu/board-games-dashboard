import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BASE = 'https://oldkingscrown.fly.dev'

export async function GET() {
  const nickname = process.env.OLDKINGSCROWN_NICKNAME || 'Dycu'
  const log: string[] = []
  log.push(`nickname: ${nickname}`)

  try {
    const listRes = await fetch(`${BASE}/api/lobbies`, { headers: { Accept: 'application/json' } })
    log.push(`GET /api/lobbies: HTTP ${listRes.status}`)
    if (!listRes.ok) return NextResponse.json({ error: `lobbies HTTP ${listRes.status}`, log }, { status: 500 })

    const { lobbies } = await listRes.json() as { lobbies: any[] }
    log.push(`total lobbies: ${lobbies.length}`)
    const waiting = lobbies.filter(l => l.status === 'waiting')
    log.push(`waiting lobbies: ${waiting.length}`)

    const details = await Promise.all(
      waiting.slice(0, 100).map(async (l: any) => {
        const res = await fetch(`${BASE}/api/lobbies/${l.id}`, { headers: { Accept: 'application/json' } })
        if (!res.ok) return null
        const { lobby } = await res.json() as { lobby: any }
        return lobby
      })
    )

    const nick = nickname.toLowerCase()
    const myLobbies = details.filter((l): l is any =>
      l !== null && l.members.some((m: any) => m.nickname.toLowerCase() === nick)
    )
    log.push(`lobbies with ${nickname} as a member: ${myLobbies.length}`)

    return NextResponse.json({ log, myLobbies })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500), log }, { status: 500 })
  }
}
