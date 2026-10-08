import { withBgaSession, bgaApiHeaders } from '@/lib/connectors/bga'

export const dynamic = 'force-dynamic'

export async function GET() {
  const username = process.env.BGA_USERNAME ?? ''
  const password = process.env.BGA_PASSWORD ?? ''

  const raw = await withBgaSession(username, password, async session => {
    const url = `https://boardgamearena.com/gamestats/gamestats/getGames.html?player=${session.myId}&opponent_id=0&finished=1&game_id=1717&page=1&updateStats=0`
    const res = await fetch(url, { headers: bgaApiHeaders(session, `https://boardgamearena.com/gamestats?player=${session.myId}`) })
    return JSON.parse(await res.text())
  })

  return Response.json(raw)
}
