'use client'
// Temporary debug page — not linked from anywhere — to inspect the
// dismissal state (lib/dismissal.ts) that only ever lives in the browser's
// own localStorage, so it can't be read any other way while diagnosing a
// live report. Remove once the "Bgs" note-prompt investigation is done.
import { useEffect, useState } from 'react'
import { readStoredOpened, Opened } from '@/lib/dismissal'
import { readCache } from '@/hooks/useGamesData'
import { Game } from '@/lib/types'

export default function DebugOpenedPage() {
  const [opened, setOpened] = useState<Opened>({})
  const [games, setGames] = useState<Game[]>([])
  const [now, setNow] = useState(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    setOpened(readStoredOpened())
    setGames(readCache()?.data.games ?? [])
    setNow(Date.now())
  }, [])

  const openedGames = games.filter(g => opened[g.id])

  return (
    <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      <h2>now: {now}</h2>
      <h2>opened (every entry)</h2>
      <pre>{JSON.stringify(opened, null, 2)}</pre>
      <h2>matching games (current myTurn, etc.)</h2>
      <pre>{JSON.stringify(openedGames.map(g => ({ id: g.id, gameName: g.gameName, myTurn: g.myTurn, lastMoveAt: g.lastMoveAt, currentPlayer: g.currentPlayer })), null, 2)}</pre>
    </div>
  )
}
