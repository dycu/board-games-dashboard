import { getPrefs } from '@/lib/prefs'

const BASE = 'https://18xx.games'

function formatCookie(sessionCookie: string): string {
  return sessionCookie.includes('=') ? sessionCookie : `auth_token=${sessionCookie}`
}

export async function GET() {
  const prefs = await getPrefs()
  const cookie = formatCookie(prefs.eighteenxxSessionCookie ?? '')

  const gamesRes = await fetch(`${BASE}/api/game/user`, { headers: { Cookie: cookie, Accept: 'application/json' } })
  const data = await gamesRes.json()
  const games: any[] = Array.isArray(data) ? data : data.games ?? []
  const active = games.filter(g => g.status === 'active')
  const sample = active[0]
  if (!sample) return Response.json({ error: 'no active games' })

  // Try the likely singular-game detail endpoint
  const detailRes = await fetch(`${BASE}/api/game/${sample.id}`, { headers: { Cookie: cookie, Accept: 'application/json' } })
  const detailText = await detailRes.text()
  let detailJson: any = null
  try { detailJson = JSON.parse(detailText) } catch { /* not JSON */ }

  return Response.json({
    gameId: sample.id,
    summaryTurn: sample.turn,
    summaryRound: sample.round,
    summaryActionsLength: (sample.actions ?? []).length,
    detailStatus: detailRes.status,
    detailKeys: detailJson ? Object.keys(detailJson) : null,
    detailActionsLength: detailJson?.actions ? detailJson.actions.length : null,
    detailActionsSample: detailJson?.actions ? detailJson.actions.slice(0, 3) : null,
    detailRoundField: detailJson?.round,
    detailTurnField: detailJson?.turn,
    rawSnippet: detailJson ? null : detailText.slice(0, 300),
  })
}
