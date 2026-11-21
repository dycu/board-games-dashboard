// Temporary debug route — reuses the already-cached Boardgamers.space
// session so this doesn't risk a fresh login. Diagnoses the "note-prompt
// never appeared" report by showing the connector's own current myTurn/
// lastMove view, independent of whatever the browser's localStorage holds.
// Delete once the investigation is done.
import { NextResponse } from 'next/server'
import { fetchBoardgamers } from '@/lib/connectors/boardgamers'

export async function GET() {
  const username = process.env.BOARDGAMERS_USERNAME
  const password = process.env.BOARDGAMERS_PASSWORD
  if (!username || !password) return NextResponse.json({ error: 'BOARDGAMERS_USERNAME/PASSWORD not set' }, { status: 500 })
  try {
    const games = await fetchBoardgamers(username, password)
    return NextResponse.json({
      games: games.map(g => ({
        id: g.id, gameName: g.gameName, myTurn: g.myTurn, pending: g.pending,
        lastMoveAt: g.lastMoveAt, lastMoveAgo: g.lastMoveAgo, currentPlayer: g.currentPlayer, deadlineAt: g.deadlineAt,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
