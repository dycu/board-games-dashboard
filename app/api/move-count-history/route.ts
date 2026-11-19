import { NextResponse } from 'next/server'
import { getMoveCountHistory } from '@/lib/moveCounts/store'

export const dynamic = 'force-dynamic'

// { date (YYYY-MM-DD, 5am-5am Europe/Warsaw) -> total moves across every
// platform that day } — see lib/moveCounts/track.ts's addToMoveCountHistory.
export async function GET() {
  try {
    return NextResponse.json({ history: await getMoveCountHistory() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
