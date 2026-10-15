import { getEighteenxxPaceGames } from '@/lib/eighteenxxPace/store'

export const runtime = 'edge'

export async function GET() {
  const games = await getEighteenxxPaceGames()
  const entries = Object.values(games)
  const target = games['270147']
  const sameTitle = entries.filter(g => g.title === '18Chesapeake')
  return new Response(JSON.stringify({
    totalTracked: entries.length,
    target,
    sameTitleCount: sameTitle.length,
    sameTitle,
  }, null, 2), { headers: { 'Content-Type': 'application/json' } })
}
