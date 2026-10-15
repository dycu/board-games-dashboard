import { getEighteenxxPaceGames } from '@/lib/eighteenxxPace/store'
import { BASE, loginEighteenxx } from '@/lib/connectors/eighteenxx'
import { withTimeout } from '@/lib/connectors/utils'

export const runtime = 'edge'

export async function GET(req: Request) {
  const games = await getEighteenxxPaceGames()
  const entries = Object.values(games)
  const target = games['270147']
  const sameTitle = entries.filter(g => g.title === '18Chesapeake')

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return new Response(JSON.stringify({ totalTracked: entries.length, target, sameTitleCount: sameTitle.length, sameTitle }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  }

  const username = process.env.EIGHTEENXX_USERNAME ?? ''
  const password = process.env.EIGHTEENXX_PASSWORD ?? ''
  const cookie = await withTimeout(loginEighteenxx(username, password, undefined), 8000, 'login')
  const res = await withTimeout(fetch(`${BASE}/api/game/${id}`, { headers: { Cookie: cookie, Accept: 'application/json' } }), 8000, 'detail fetch')
  const data = await res.json().catch(() => null)
  return new Response(JSON.stringify({ ok: res.ok, status: res.status, actionsLength: Array.isArray(data?.actions) ? data.actions.length : 'not-array', data }, null, 2), { headers: { 'Content-Type': 'application/json' } })
}
