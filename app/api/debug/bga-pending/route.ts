import { NextResponse } from 'next/server'
import { withBgaSession, fetchBgaTables } from '@/lib/connectors/bga'

export const dynamic = 'force-dynamic'

// Temporary: inspect BGA's raw tableinfos.html response to see why a
// lobby waiting for players isn't showing up on the dashboard.
export async function GET() {
  const username = process.env.BGA_USERNAME!
  const password = process.env.BGA_PASSWORD!
  const result = await withBgaSession(username, password, async s => {
    const play = await fetchBgaTables(s, 'play').catch(e => ({ error: String(e) }))
    const setup = await fetchBgaTables(s, 'setup').catch(e => ({ error: String(e) }))
    return { play, setup }
  })
  const summarize = (tables: any) => Array.isArray(tables)
    ? tables.map((t: any) => ({ id: t.id, game_name: t.game_name, status: t.status, max_player: t.max_player, current_present_player_nbr: t.current_present_player_nbr }))
    : tables
  return NextResponse.json({ play: summarize(result.play), setup: summarize(result.setup) })
}
