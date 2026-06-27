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
  if (!gamesRes.ok) throw new Error('Yucata games fetch failed')

  const gamesData = await gamesRes.json()
  const games: any[] = gamesData.d?.Games ?? []

  return games.map((g: any): Game => {
    // Field names inferred from WCF type CurrentGameInfo:#Yucata.Data —
    // Games array was empty during initial testing so we handle multiple possible names
    const gameId = g.GameID ?? g.Id ?? g.GameId ?? 0
    const idName = g.IdName ?? g.GameTypeIdName ?? ''
    const gameName = g.GameName ?? g.ShortName ?? idName ?? 'Unknown'

    const isMyTurn = !!(g.CanMove ?? g.IsMyTurn ?? g.MyTurn ?? false)

    const rawPlayers: any[] = g.Players ?? g.Opponents ?? []
    const players = rawPlayers
      .map((p: any) => p.Login ?? p.UserLogin ?? p.Name ?? '')
      .filter((n: string) => n && n !== username)

    const activePlayerLogin = g.ActivePlayer?.Login ?? g.ActivePlayerLogin ?? g.CurrentPlayer ?? undefined
    const currentPlayer = isMyTurn ? undefined : activePlayerLogin

    // LastMoveTime is a WCF date serialised as /Date(milliseconds)/
    const rawTime = g.LastMoveTime ?? g.LastMoveDate ?? g.UpdatedAt
    const lastMoveAt = rawTime
      ? parseDotNetDate(rawTime)
      : new Date()

    return {
      id: `yucata:${gameId}`,
      platform: 'yucata',
      gameName,
      myTurn: isMyTurn,
      currentPlayer,
      lastMoveAt,
      lastMoveAgo: formatTimeAgo(lastMoveAt),
      urgent: Date.now() - lastMoveAt.getTime() > 2 * 24 * 60 * 60 * 1000,
      gameUrl: `${BASE}/en/Game/${idName || gameId}/${gameId}`,
      platformUrl: `${BASE}/en/Overview`,
      players,
    }
  })
}

// WCF serialises dates as "/Date(1234567890000)/" or ISO strings
function parseDotNetDate(raw: string | number): Date {
  if (typeof raw === 'number') return new Date(raw)
  const m = String(raw).match(/\/Date\((-?\d+)(?:[+-]\d+)?\)\//)
  if (m) return new Date(parseInt(m[1]))
  return new Date(raw)
}
