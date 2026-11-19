import { withRallySession, fetchActiveGamesHtml } from '@/lib/connectors/rally'

// Temporary: check whether Rally's real active-games HTML marks the
// currently-active player the way the hand-made test fixture does
// (an `is_active` class on their <a> in the Players: line) — if so,
// currentPlayer can finally be set for Rally's active games. Delete
// after use.
export async function GET() {
  const username = process.env.RALLY_USERNAME ?? ''
  const password = process.env.RALLY_PASSWORD ?? ''
  const html = await withRallySession(username, password, fetchActiveGamesHtml)
  const moveIdx = html.indexOf('<h2>Move</h2>')
  const activeIdx = html.indexOf('<h2>Active</h2>')
  const finishedIdx = html.indexOf('<h2>Recently finished</h2>')
  return Response.json({
    moveSection: moveIdx >= 0 ? html.slice(moveIdx, activeIdx >= 0 ? activeIdx : finishedIdx).slice(0, 4000) : null,
    activeSection: activeIdx >= 0 ? html.slice(activeIdx, finishedIdx >= 0 ? finishedIdx : undefined).slice(0, 4000) : null,
    hasIsActiveAnywhere: html.includes('is_active'),
  })
}
