import { NextResponse } from 'next/server'
import { fetchBgaPlayTotals } from '@/lib/connectors/bga'
import { hasCreds } from '@/lib/connectors'

export const dynamic = 'force-dynamic'
// First call resolves display names for every game ever played (cached in KV after)
export const maxDuration = 60

export async function GET() {
  if (!hasCreds('bga')) return NextResponse.json({ totals: [] })
  try {
    const totals = (await fetchBgaPlayTotals(process.env.BGA_USERNAME!, process.env.BGA_PASSWORD!)).map(t => ({
      platform: 'bga',
      gameName: t.name,
      gameUrl: `https://boardgamearena.com/gamepanel?game=${encodeURIComponent(t.slug)}`,
      plays: t.plays,
    }))
    return NextResponse.json({ totals })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
