import { NextResponse } from 'next/server'
import { Platform } from '@/lib/types'
import { getNotes } from '@/lib/notes/store'
import { getTableLabels } from '@/lib/tableLabels/store'
import { getBacklog } from '@/lib/backlog/store'
import { getOpponents } from '@/lib/opponents/store'
import { getAchievements } from '@/lib/achievements/store'
import { getPrefs } from '@/lib/prefs'

export const dynamic = 'force-dynamic'

const PLATFORMS: Platform[] = ['bga', 'eighteenxx', 'obg', 'yucata', 'choochoo', 'hansa', 'rally', 'oldkingscrown', 'boardgamers', 'boardtogether']

// Everything this app itself stores (not the live game/history data every
// connector re-fetches from its site) in one JSON snapshot — table notes
// and labels, backlog lists, opponent tags, achievements, and settings.
// There's no restore endpoint: this is a read-only backup, not a sync
// mechanism, so there's nothing here that could overwrite live data.
export async function GET() {
  try {
    const [notes, tableLabels, backlog, achievements, prefs, opponentsEntries] = await Promise.all([
      getNotes(),
      getTableLabels(),
      getBacklog(),
      getAchievements(),
      getPrefs(),
      Promise.all(PLATFORMS.map(p => getOpponents(p))),
    ])
    const opponents = Object.fromEntries(PLATFORMS.map((p, i) => [p, opponentsEntries[i]]))

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      notes,
      tableLabels,
      backlog,
      opponents,
      achievements,
      prefs,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
