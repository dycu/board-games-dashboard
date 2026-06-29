import { request as httpsRequest } from 'https'
import type { FinishedGame } from '@/lib/types'
import { formatTimeAgo } from '@/lib/connectors/utils'

export const dynamic = 'force-dynamic'

const API_HOST = 'api.choochoo.games'
const BASE_URL = 'https://www.choochoo.games'

function req(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; body: string; cookies: string[] }> {
  return new Promise((resolve) => {
    const r = httpsRequest(
      { hostname: API_HOST, port: 443, path, method, headers, rejectUnauthorized: false, timeout: 15000 },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c })
        const cookies = (res.headers['set-cookie'] ?? []) as string[]
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data, cookies }))
      },
    )
    r.on('error', (e) => resolve({ status: 0, body: `ERROR: ${e.message}`, cookies: [] }))
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT', cookies: [] }) })
    if (body) r.write(body)
    r.end()
  })
}

export async function GET() {
  const username = process.env.CHOOCHOO_USERNAME ?? ''
  const password = process.env.CHOOCHOO_PASSWORD ?? ''
  if (!username || !password) {
    return Response.json({ games: [], error: 'credentials not configured' })
  }

  const base = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

  const xsrfRes = await req('GET', '/api/xsrf', base)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch {}
  const xsrfCookie = xsrfRes.cookies.map(c => c.split(';')[0]).join('; ')
  if (!xsrfToken || !xsrfCookie) {
    return Response.json({ games: [], error: 'choochoo: xsrf failed' })
  }

  const loginBody = JSON.stringify({ usernameOrEmail: username, password })
  const loginRes = await req('POST', '/api/users/login', {
    ...base,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginBody).toString(),
    'xsrf-token': xsrfToken,
    Cookie: xsrfCookie,
  }, loginBody)
  let loginJson: any = {}
  try { loginJson = JSON.parse(loginRes.body) } catch {}
  const myUserId: number = loginJson?.user?.id
  if (!myUserId) {
    return Response.json({ games: [], error: 'choochoo: login failed' })
  }
  const authCookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ') || xsrfCookie

  // Fetch ended games filtered server-side by userId — pageSize max is 20
  const allGames: any[] = []
  let cursor: string | null = null
  let pages = 0
  do {
    const path = `/api/games?userId=${myUserId}&status[]=ENDED&pageSize=20${cursor ? `&cursor=${cursor}` : ''}`
    const res = await req('GET', path, { ...base, Cookie: authCookie })
    let json: any = {}
    try { json = JSON.parse(res.body) } catch {}
    const games: any[] = json.games ?? (Array.isArray(json) ? json : [])
    allGames.push(...games)
    cursor = json.nextPageCursor ?? null
    pages++
  } while (cursor && pages < 5) // cap at 5 pages (100 games)

  // The game list API has no date field; use turnStartTime from detail if ever needed.
  // For now use the game's updatedAt if present, otherwise fall back gracefully.
  const games: FinishedGame[] = allGames.map((g: any): FinishedGame => {
    const gameId = g.id ?? 0
    const completedAt = g.updatedAt ? new Date(g.updatedAt) : g.endedAt ? new Date(g.endedAt) : new Date(0)
    return {
      id: `choochoo:${gameId}`,
      platform: 'choochoo',
      gameName: g.name ?? g.gameKey ?? 'Unknown',
      completedAt,
      completedAgo: completedAt.getTime() === 0 ? 'unknown' : formatTimeAgo(completedAt),
      gameUrl: `${BASE_URL}/app/games/${gameId}`,
    }
  })

  return Response.json({ games, error: null })
}
