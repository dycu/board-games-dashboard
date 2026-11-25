import { NextResponse } from 'next/server'
import { PLATFORM_LABELS, Platform } from '@/lib/types'
import { getAllDays, putDays } from '@/lib/perPlayerMoves/store'

export const dynamic = 'force-dynamic'

// One-off: a lobby's "N/M joined — waiting..." status text got mistakenly
// credited as a player's move once a table actually started (see
// lib/opponents/track.ts's attachOpponentTracking) — this drops any such
// bogus entry already written to KV. The code fix prevents new ones;
// this just cleans up what's already there.
const BOGUS = /joined — waiting (for players|to start)$/

export async function GET() {
  const report: Record<string, string[]> = {}
  for (const platform of Object.keys(PLATFORM_LABELS) as Platform[]) {
    const all = await getAllDays(platform)
    const updates: Record<string, Record<string, Record<string, number>>> = {}
    for (const [tableId, days] of Object.entries(all)) {
      let touched = false
      const nextDays = { ...days }
      for (const [date, counts] of Object.entries(nextDays)) {
        const bogusKeys = Object.keys(counts).filter(k => BOGUS.test(k))
        if (bogusKeys.length === 0) continue
        touched = true
        const nextCounts = { ...counts }
        for (const k of bogusKeys) delete nextCounts[k]
        nextDays[date] = nextCounts
        report[platform] = [...(report[platform] ?? []), `${tableId} ${date}: ${bogusKeys.join(', ')}`]
      }
      if (touched) updates[tableId] = nextDays
    }
    if (Object.keys(updates).length > 0) await putDays(platform, updates)
  }
  return NextResponse.json(report)
}
