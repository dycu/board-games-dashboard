import { getEighteenxxPaceGames } from '@/lib/eighteenxxPace/store'
import { BASE, loginEighteenxx, fetchProfileGames } from '@/lib/connectors/eighteenxx'

export const runtime = 'edge'

export async function GET() {
  const games = await getEighteenxxPaceGames()
  const entries = Object.values(games)
  const target = games['270147']
  const sameTitle = entries.filter(g => g.title === '18Chesapeake')

  const username = process.env.EIGHTEENXX_USERNAME ?? ''
  const password = process.env.EIGHTEENXX_PASSWORD ?? ''
  const cookie = await loginEighteenxx(username, password, undefined)
  const { games: profileGames } = await fetchProfileGames(username, password, undefined)
  const profileMatches = profileGames.filter((g: any) => g.title === '18Chesapeake')
    .map((g: any) => ({ id: g.id, status: g.status, finished_at: g.finished_at, updated_at: g.updated_at }))

  const rawDetails: Record<string, any> = {}
  for (const g of sameTitle) {
    const res = await fetch(`${BASE}/api/game/${g.id}`, { headers: { Cookie: cookie, Accept: 'application/json' } })
    const data = await res.json().catch(() => null)
    rawDetails[g.id] = { ok: res.ok, status: res.status, actionsLength: Array.isArray(data?.actions) ? data.actions.length : 'not-array', topLevelKeys: data ? Object.keys(data) : null }
  }

  return new Response(JSON.stringify({
    totalTracked: entries.length,
    target,
    sameTitleCount: sameTitle.length,
    sameTitle,
    profileMatches,
    rawDetails,
  }, null, 2), { headers: { 'Content-Type': 'application/json' } })
}
