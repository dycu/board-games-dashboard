import { withBgaSession, bgaApiHeaders } from '@/lib/connectors/bga'

// Temporary: check whether BGA's finished-games endpoint (gamestats/getGames)
// carries any avatar-ish field per row, the way the active tableinfos
// endpoint's `players` dict does — to see if avatars can be backfilled for
// historical opponents, not just ones in a currently active game. Delete
// after use.
export async function GET() {
  const username = process.env.BGA_USERNAME ?? ''
  const password = process.env.BGA_PASSWORD ?? ''
  const result = await withBgaSession(username, password, async session => {
    const url = `https://boardgamearena.com/gamestats/gamestats/getGames.html?player=${session.myId}&opponent_id=0&finished=1&page=1&updateStats=0`
    const res = await fetch(url, { headers: bgaApiHeaders(session, `https://boardgamearena.com/gamestats?player=${session.myId}`) })
    const json = await res.json()
    return { sample: (json?.data?.tables ?? []).slice(0, 2) }
  })
  return Response.json(result)
}
