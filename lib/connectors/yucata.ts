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

  // Step 3: fetch active games
  // Response: {d: {Games: CurrentGameRecord[], ...}}
  // CurrentGameRecord fields: ID, GameIDName, GameName, GameShortName,
  //   UserIsOnTurn, PlayerOnTurn, LastMoveOn, Players: PlayerInfo[]
  // PlayerInfo fields: PlayerID, Login, Order, Rank, IsOnVacation
  const gamesRes = await fetch(`${WCF}/GetLiveGames`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      Cookie: cookies,
      'User-Agent': 'Mozilla/5.0',
      Referer: `${BASE}/en/Overview`,
    },
    body: '{}',
  })
  if (!gamesRes.ok) throw new Error(`Yucata games fetch failed: HTTP ${gamesRes.status}`)

  const gamesData = await gamesRes.json()
  const games: any[] = gamesData.d?.Games ?? []

  // Derive my PlayerID from games where it's my turn (UserIsOnTurn + PlayerOnTurn = my ID)
  const myPlayerIds = new Set<number>()
  for (const g of games) {
    if (g.UserIsOnTurn && g.PlayerOnTurn) myPlayerIds.add(g.PlayerOnTurn)
  }

  return games.map((g: any): Game => {
    const gameId = g.ID ?? 0
    const gameIdName = g.GameIDName ?? ''
    const gameName = g.GameShortName ?? g.GameName ?? 'Unknown'

    const isMyTurn = !!g.UserIsOnTurn

    const rawPlayers: any[] = g.Players ?? []

    const otherPlayers = rawPlayers
      .filter((p: any) => myPlayerIds.size > 0
        ? !myPlayerIds.has(p.PlayerID)
        : p.Login?.toLowerCase() !== username.toLowerCase())
      .map((p: any) => p.Login ?? '')
      .filter(Boolean)

    const currentPlayerObj = isMyTurn
      ? undefined
      : rawPlayers.find((p: any) => p.PlayerID === g.PlayerOnTurn)
    const currentPlayer = currentPlayerObj?.Login

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
      gameUrl: `${BASE}/en/Game/${gameIdName || gameId}/${gameId}`,
      platformUrl: `${BASE}/en/Overview`,
      players: otherPlayers,
    }
  })
}
