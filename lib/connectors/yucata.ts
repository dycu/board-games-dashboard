import { kv } from '@vercel/kv'
import { Game, FinishedGame } from '../types'
import { formatTimeAgo, withTimeout } from './utils'
import { resultFromRanks } from '../results'

const BASE = 'https://www.yucata.de'

type YucataJar = Record<string, string>

const SESSION_KV_KEY = 'yucata-session'
// Yucata used to log in fresh on every single call (active *and* finished
// games each paid for their own 2-request login dance) — a cached cookie
// jar cuts a warm refresh down to the one or two requests that actually
// need it. A stale/rejected cached jar falls back to a fresh login
// automatically (see withYucataSession below), so a long TTL costs nothing
// when it's wrong.
const SESSION_TTL_SECONDS = 12 * 60 * 60

async function quietly<T>(op: () => Promise<T>): Promise<T | null> {
  try { return await op() } catch { return null }
}

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
  const initRes = await withTimeout(fetch(`${BASE}/en`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    redirect: 'manual',
  }), 10_000, 'Yucata session-cookie request')
  collectCookies(initRes, jar)

  // Step 2: login via the REST API (replaces the retired AuthenticateViaAjax WCF
  // service) — returns {success, verificationRequired} and may set/renew cookies
  const loginRes = await withTimeout(fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      Cookie: cookieHeader(jar),
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ login: username, password, remember: false }),
  }), 10_000, 'Yucata login request')
  const loginData = await loginRes.json()
  if (loginData.verificationRequired) {
    throw new Error('Yucata login requires additional verification — log in via a browser once to clear it')
  }
  if (!loginData.success) throw new Error('Yucata login failed')
  collectCookies(loginRes, jar)
  return jar
}

// Runs fn with, first, the cached cookie jar; a real login only happens when
// there's no cached jar or Yucata rejects it (fn throwing is the signal —
// every call below already throws on a bad/unauthenticated response).
export async function withYucataSession<T>(
  username: string,
  password: string,
  fn: (jar: YucataJar) => Promise<T>,
): Promise<T> {
  const cached = await quietly(() => kv.get<YucataJar>(SESSION_KV_KEY))
  if (cached) {
    try {
      return await fn(cached)
    } catch {
      await quietly(() => kv.del(SESSION_KV_KEY))
    }
  }
  const jar = await login(username, password)
  await quietly(() => kv.set(SESSION_KV_KEY, jar, { ex: SESSION_TTL_SECONDS }))
  return fn(jar)
}

export async function fetchYucata(username: string, password: string): Promise<Game[]> {
  return withYucataSession(username, password, async jar => {
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
  })
}

export async function fetchFinishedYucata(username: string, password: string): Promise<FinishedGame[]> {
  return withYucataSession(username, password, async jar => {
    const headers = {
      Cookie: cookieHeader(jar),
      'User-Agent': 'Mozilla/5.0',
      Referer: `${BASE}/en/Overview`,
    }

    // The finished-games endpoint is keyed by numeric user ID, which no API
    // response exposes — the logged-in lobby page declares it as a JS global:
    //   var UserID = '1031968';
    // Each step gets its own timeout (instead of relying only on the route's
    // overall one) purely so a failure here says which specific request
    // stalled, rather than a single generic "yucata timed out".
    const overviewRes = await withTimeout(fetch(`${BASE}/en/Overview`, {
      headers: { ...headers, Accept: 'text/html' },
    }), 10_000, 'Yucata lobby page')
    const overviewHtml = await overviewRes.text()
    const userId = overviewHtml.match(/var\s+UserID\s*=\s*['"]?(\d+)/)?.[1]
    if (!userId) throw new Error('Yucata user ID not found on lobby page')

    // Same server-side datatables endpoint the lobby's "Finished games" table uses.
    // Response: {recordsTotal, data: [{gameId, gameName, customGameName, finishedOn, ...}]}
    //
    // An unbounded fromDate makes this query itself take 30+ seconds and
    // then fail with a 500 — confirmed by timing it directly: the cost
    // scales with how far back the date range reaches, not with how many
    // rows actually come back (same 21 rows at both a 1-year and a 5-year
    // window, 3s vs 20s). A 2-year floor keeps every game this account has
    // ever finished (going back further found nothing older) while staying
    // fast; a newer account that outgrows it just needs this widened later.
    const fromDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const res = await withTimeout(fetch(`${BASE}/api/datatables/${userId}/ranking-details`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
      body: JSON.stringify({ draw: 1, start: 0, length: 300, oppId: -1, gameType: -1, fromDate, toDate: '' }),
    }), 10_000, 'Yucata finished-games table')
    if (!res.ok) throw new Error(`Yucata finished games fetch failed: HTTP ${res.status}`)

    const data = await res.json()
    const rows: any[] = data.data ?? []

    return rows.map((g: any): FinishedGame => {
      const completedAt = new Date(g.finishedOn)
      const rank = Number(g.finalPosition)
      const ranks = [rank, ...(g.opponents ?? []).map((o: any) => Number(o.finalPosition))]
      const opponents = (g.opponents ?? [])
        .filter((o: any) => o?.login)
        .map((o: any) => ({ name: String(o.login), rank: Number(o.finalPosition) || undefined }))
      return {
        ...(rank > 0 && { result: resultFromRanks(rank, ranks), rank, playerCount: Number(g.numPlayers) || ranks.length }),
        ...(opponents.length > 0 && { opponents }),
        id: `yucata:${g.gameId}`,
        platform: 'yucata',
        gameName: g.customGameName || g.gameName || 'Unknown',
        completedAt,
        completedAgo: formatTimeAgo(completedAt),
        gameUrl: `${BASE}/en/game/${g.gameId}`,
      }
    })
  })
}
