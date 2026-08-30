import { Game } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://www.yucata.de'

export async function fetchYucata(username: string, password: string): Promise<Game[]> {
  // Step 1: get ASP.NET session cookie
  const initRes = await fetch(`${BASE}/en`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    redirect: 'manual',
  })
  const sessionCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''

  // Step 2: login via the REST API (replaces the retired AuthenticateViaAjax WCF
  // service) — returns {success: true} and sets an auth cookie
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
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
  if (!loginData.success) throw new Error('Yucata login failed')

  const authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  const cookies = [sessionCookie, authCookie].filter(Boolean).join('; ')

  // Step 3: fetch active games (replaces the retired GetLiveGames WCF service)
  // Response: {games: CurrentGameRecord[]}
  // CurrentGameRecord fields: id, gameIDName, gameName, gameShortName,
  //   userIsOnTurn, playerOnTurn, lastMoveOn, players: PlayerInfo[]
  // PlayerInfo fields: playerID, login, since, isOnVacation
  const gamesRes = await fetch(`${BASE}/api/user/me/games/current`, {
    headers: {
      Accept: 'application/json',
      Cookie: cookies,
      'User-Agent': 'Mozilla/5.0',
      Referer: `${BASE}/en/Overview`,
    },
  })
  if (!gamesRes.ok) throw new Error(`Yucata games fetch failed: HTTP ${gamesRes.status}`)

  const gamesData = await gamesRes.json()
  const games: any[] = gamesData.games ?? []

  // Derive my playerID from games where it's my turn (userIsOnTurn + playerOnTurn = my ID)
  const myPlayerIds = new Set<number>()
  for (const g of games) {
    if (g.userIsOnTurn && g.playerOnTurn > 0) myPlayerIds.add(g.playerOnTurn)
  }

  return games.map((g: any): Game => {
    const gameId = g.id ?? 0
    const gameName = g.gameShortName ?? g.gameName ?? 'Unknown'

    const isMyTurn = !!g.userIsOnTurn

    const rawPlayers: any[] = g.players ?? []

    const otherPlayers = rawPlayers
      .filter((p: any) => myPlayerIds.size > 0
        ? !myPlayerIds.has(p.playerID)
        : p.login?.toLowerCase() !== username.toLowerCase())
      .map((p: any) => p.login ?? '')
      .filter(Boolean)

    const currentPlayerObj = isMyTurn
      ? undefined
      : rawPlayers.find((p: any) => p.playerID === g.playerOnTurn)
    const currentPlayer = currentPlayerObj?.login

    const lastMoveAt = g.lastMoveOn ? new Date(g.lastMoveOn) : new Date()

    return {
      id: `yucata:${gameId}`,
      platform: 'yucata',
      gameName,
      myTurn: isMyTurn,
      currentPlayer,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl: `${BASE}/en/game/${gameId}`,
      platformUrl: `${BASE}/en/Overview`,
      players: otherPlayers,
    }
  })
}
