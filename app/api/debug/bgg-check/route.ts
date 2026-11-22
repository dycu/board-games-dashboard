// Temporary debug route — checks whether BoardGameGeek's public XML API is
// reachable from this deployment at all (it refused both a plain and a
// browser-UA request from the dev sandbox), before investing in building
// the actual weight-lookup feature on top of it. Delete once answered.
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch('https://boardgamegeek.com/xmlapi2/search?query=Gaia+Project&type=boardgame', {
      headers: { 'User-Agent': 'board-games-dashboard/1.0 (personal project; github.com/dycu/board-games-dashboard)' },
    })
    const text = await res.text()
    return NextResponse.json({ status: res.status, ok: res.ok, bodyStart: text.slice(0, 500) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
