import { fetchChoochoo } from '@/lib/connectors/choochoo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME ?? ''
  const password = process.env.CHOOCHOO_PASSWORD ?? ''
  if (!username || !password) {
    return Response.json({ games: [], error: 'credentials not configured' })
  }
  try {
    const games = await fetchChoochoo(username, password)
    return Response.json({ games, error: null })
  } catch (e) {
    return Response.json({ games: [], error: e instanceof Error ? e.message : String(e) })
  }
}
