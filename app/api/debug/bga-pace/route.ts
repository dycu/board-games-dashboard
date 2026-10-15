import { getTables } from '@/lib/pace/store'

export const runtime = 'edge'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const game = searchParams.get('game')
  const tables = await getTables()
  const entries = Object.values(tables)
  const target = id ? tables[id] : undefined
  const sameGame = game ? entries.filter(t => t.game === game) : []
  return new Response(JSON.stringify({
    totalTracked: entries.length,
    target,
    sameGameCount: sameGame.length,
    sameGame,
  }, null, 2), { headers: { 'Content-Type': 'application/json' } })
}
