import { request as httpsRequest } from 'https'
import type { Game } from '@/lib/types'
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

  // Step 1: XSRF token + session cookie
  const xsrfRes = await req('GET', '/api/xsrf', base)
  let xsrfToken = ''
  try { xsrfToken = JSON.parse(xsrfRes.body).xsrfToken ?? '' } catch {}
  const xsrfCookie = xsrfRes.cookies.map(c => c.split(';')[0]).join('; ')
  if (!xsrfToken || !xsrfCookie) {
    return Response.json({ games: [], error: `choochoo: xsrf failed (token=${!!xsrfToken} cookie=${!!xsrfCookie} status=${xsrfRes.status})` })
  }

  // Step 2: login
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
    return Response.json({ games: [], error: `choochoo: login failed (${loginRes.status}: ${loginRes.body.slice(0, 100)})` })
  }
  const authCookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ') || xsrfCookie

  // Step 3: active games — userId filters server-side to games I'm a player in. Without it the
  // endpoint returns a global pool capped by pageSize, which can silently omit my active games.
  const gamesRes = await req('GET', `/api/games?status[]=ACTIVE&userId=${myUserId}`, { ...base, Cookie: authCookie })
  let gamesJson: any = {}
  try { gamesJson = JSON.parse(gamesRes.body) } catch {}
  const allGames: any[] = gamesJson.games ?? (Array.isArray(gamesJson) ? gamesJson : [])
  const myGames = allGames.filter((g: any) => Array.isArray(g.playerIds) && g.playerIds.includes(myUserId))

  const games: Game[] = myGames.map((g: any): Game => {
    const gameId = g.id ?? 0
    const isMyTurn = g.activePlayerId === myUserId
    const otherPlayerIds: number[] = (g.playerIds ?? []).filter((id: number) => id !== myUserId)
    const lastMoveAt = g.updatedAt ? new Date(g.updatedAt) : new Date()
    return {
      id: `choochoo:${gameId}`,
      platform: 'choochoo',
      gameName: g.name ?? g.gameKey ?? 'Unknown',
      myTurn: isMyTurn,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl: `${BASE_URL}/app/games/${gameId}`,
      platformUrl: `${BASE_URL}/`,
      players: otherPlayerIds.map(String),
    }
  })

  return Response.json({ games, error: null })
}
