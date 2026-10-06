import { Game, FinishedGame } from '../types'
import { formatTimeAgo } from './utils'

const BASE = 'https://www.yucata.de'

// A single Set-Cookie header value looks like "name=value; Path=/; ...".
// When a response sets *multiple* cookies, fetch's headers.get('set-cookie')
// joins them with ", " — which is ambiguous with the comma inside a cookie's
// own Expires date, so naive splitting silently drops all but the first
// cookie. headers.getSetCookie() (Node 18.14+/undici) returns them as a
// proper array; fall back to the single-header case for other runtimes.
function collectCookies(res: Response, jar: Record<string, string>): void {
  const getAll = res.headers.getSetCookie
  const raw = typeof getAll === 'function'
    ? getAll.call(res.headers)
    : [res.headers.get('set-cookie')].filter((v): v is string => !!v)

  for (const cookie of raw) {
    const pair = cookie.split(';')[0]
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
}

async function login(username: string, password: string): Promise<Record<string, string>> {
  const jar: Record<string, string> = {}

  // Step 1: get ASP.NET session cookie
  const initRes = await fetch(`${BASE}/en`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    redirect: 'manual',
  })
  collectCookies(initRes, jar)

  // Step 2: login via the REST API (replaces the retired AuthenticateViaAjax WCF
  // service) — returns {success, verificationRequired} and may set/renew cookies
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      Cookie: cookieHeader(jar),
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ login: username, password, remember: false }),
  })
  const loginData = await loginRes.json()
  if (loginData.verificationRequired) {
    throw new Error('Yucata login requires additional verification — log in via a browser once to clear it')
  }
  if (!loginData.success) throw new Error('Yucata login failed')
  collectCookies(loginRes, jar)
  return jar
}

export async function fetchYucata(username: string, password: string): Promise<Game[]> {
  const jar = await login(username, password)

  // Step 3: fetch active games (replaces the retired GetLiveGames WCF service)
  // Response: {games: CurrentGameRecord[]}
  // CurrentGameRecord fields: id, gameIDName, gameName, gameShortName,
  //   userIsOnTurn, playerOnTurn, lastMoveOn, players: PlayerInfo[]
  // PlayerInfo fields: playerID, login, since, isOnVacation
  const gamesRes = await fetch(`${BASE}/api/user/me/games/current`, {
    headers: {
      Accept: 'application/json',
      Cookie: cookieHeader(jar),
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

export async function fetchFinishedYucata(username: string, password: string): Promise<FinishedGame[]> {
  const jar = await login(username, password)
  const headers = {
    Cookie: cookieHeader(jar),
    'User-Agent': 'Mozilla/5.0',
    Referer: `${BASE}/en/Overview`,
  }

  // The finished-games endpoint is keyed by numeric user ID, which no API
  // response exposes — the logged-in lobby page declares it as a JS global:
  //   var UserID = '1031968';
  const overviewRes = await fetch(`${BASE}/en/Overview`, {
    headers: { ...headers, Accept: 'text/html' },
  })
  const overviewHtml = await overviewRes.text()
  const userId = overviewHtml.match(/var\s+UserID\s*=\s*['"]?(\d+)/)?.[1]
  if (!userId) throw new Error('Yucata user ID not found on lobby page')

  // Same server-side datatables endpoint the lobby's "Finished games" table uses.
  // Response: {recordsTotal, data: [{gameId, gameName, customGameName, finishedOn, ...}]}
  const res = await fetch(`${BASE}/api/datatables/${userId}/ranking-details`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
    body: JSON.stringify({ draw: 1, start: 0, length: 100, oppId: -1, gameType: -1, fromDate: '', toDate: '' }),
  })
  if (!res.ok) throw new Error(`Yucata finished games fetch failed: HTTP ${res.status}`)

  const data = await res.json()
  const rows: any[] = data.data ?? []

  return rows.map((g: any): FinishedGame => {
    const completedAt = new Date(g.finishedOn)
    return {
      id: `yucata:${g.gameId}`,
      platform: 'yucata',
      gameName: g.customGameName || g.gameName || 'Unknown',
      completedAt,
      completedAgo: formatTimeAgo(completedAt),
      gameUrl: `${BASE}/en/game/${g.gameId}`,
    }
  })
}
