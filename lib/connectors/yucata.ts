import { Game } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://www.yucata.de'
const WCF = `${BASE}/Services/YucataService.svc`

export async function fetchYucata(username: string, password: string): Promise<Game[]> {
  // Step 1: get ASP.NET session cookie
  const initRes = await fetch(`${BASE}/en`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    redirect: 'manual',
  })
  const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''

  // Step 2: login via WCF JSON service — returns {d: true} and sets Yucata=<hex> cookie
  const loginRes = await fetch(`${WCF}/AuthenticateViaAjax`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      Cookie: sessionCookie,
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ login: username, password, remember: false }),
  })
  const loginData = await loginRes.json()
  if (!loginData.d) throw new Error('Yucata login failed')

  const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  const cookies = [sessionCookie, authCookie].filter(Boolean).join('; ')

  // Step 3: fetch active games — returns {d: {Games: [...], NextGameOnTurn, TotalGames}}
  const gamesRes = await fetch(`${WCF}/GetCurrentGames`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      Cookie: cookies,
      'User-Agent': 'Mozilla/5.0',
      Referer: `${BASE}/en/CurrentGames`,
    },
    body: '{}',
  })
  if (!gamesRes.ok) throw new Error(`Yucata games fetch failed: HTTP ${gamesRes.status}`)

  const gamesData = await gamesRes.json()
  const games: any[] = gamesData.d?.Games ?? []

  return games.map((g: any): Game => {
    const gameId = g.ID ?? 0
    const gameName = g.GameName ?? 'Unknown'

    const rawPlayers: any[] = g.Players ?? []

    // Find my player ID by matching Login (case-insensitive)
    const me = rawPlayers.find((p: any) => p.Login?.toLowerCase() === username.toLowerCase())
    const myPlayerId: number | undefined = me?.PlayerID

    const isMyTurn = myPlayerId !== undefined && g.PlayerOnTurn === myPlayerId

    const otherPlayers = rawPlayers
      .filter((p: any) => p.Login?.toLowerCase() !== username.toLowerCase())
      .map((p: any) => p.Login ?? '')
      .filter(Boolean)

    const currentPlayerObj = isMyTurn ? undefined : rawPlayers.find((p: any) => p.PlayerID === g.PlayerOnTurn)
    const currentPlayer = currentPlayerObj?.Login

    // LastMoveOn is ISO 8601: "2024-01-15T10:30:00.0000000Z"
    const lastMoveAt = g.LastMoveOn ? new Date(g.LastMoveOn) : new Date()

    return {
      id: `yucata:${gameId}`,
      platform: 'yucata',
      gameName,
      myTurn: isMyTurn,
      currentPlayer,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl: `${BASE}/en/Game/${gameId}`,
      platformUrl: `${BASE}/en/CurrentGames`,
      players: otherPlayers,
    }
  })
}
