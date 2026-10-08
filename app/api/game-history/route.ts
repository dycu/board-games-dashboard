import { fetchBgaGameHistory } from '@/lib/connectors/bga'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// ?platform=bga&key=<BGA game_id>: every finished game of that game. Other
// sites have no per-game history; the page uses the general history for them.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const platform = params.get('platform')
  const key = params.get('key') ?? ''
  if (platform !== 'bga' || !/^\d+$/.test(key)) {
    return Response.json({ error: 'only BGA games with a numeric key have a full history' }, { status: 400 })
  }
  try {
    const games = await fetchBgaGameHistory(process.env.BGA_USERNAME ?? '', process.env.BGA_PASSWORD ?? '', key)
    return Response.json({ games })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
