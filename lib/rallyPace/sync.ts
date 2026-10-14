import WebSocket from 'ws'
import { fetchRallyWithSession, HEADERS } from '../connectors/rally'
import { getRallyGames, putRallyGames, RallyPaceGame } from './store'

// fnv1a_log([]) (Rally's own hash of an empty client-side log) — the seed
// value with the loop never running, since we never keep a local log here
const EMPTY_LOG_HASH = 2166136261

const CONCURRENCY = 3
const CONNECT_TIMEOUT_MS = 8000

function titleFromGameUrl(gameUrl: string): string {
  return new URL(gameUrl).pathname.split('/').filter(Boolean)[0]
}

type FetchResult = { turn: number } | { error: string }

// Connects to the game's own live-state socket just long enough to read the
// first "state" message, which carries the whole game's current view — same
// data the game's own UI renders from, including its own turn counter.
function fetchTurn(gameUrl: string, cookie: string): Promise<FetchResult> {
  return new Promise(resolve => {
    const url = new URL(gameUrl)
    const title = titleFromGameUrl(gameUrl)
    const game = url.searchParams.get('game')
    const role = url.searchParams.get('role') ?? ''
    const wsUrl = `wss://${url.host}/play-socket?title=${title}&game=${game}&role=${encodeURIComponent(role)}&seen=0&hash=${EMPTY_LOG_HASH}`

    let settled = false
    const ws = new WebSocket(wsUrl, { headers: { Cookie: cookie, 'User-Agent': HEADERS['User-Agent'] } })
    const finish = (result: FetchResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ws.close()
      resolve(result)
    }
    const timer = setTimeout(() => finish({ error: 'timed out waiting for the game state' }), CONNECT_TIMEOUT_MS)

    ws.on('message', (data: Buffer) => {
      try {
        const [cmd, arg] = JSON.parse(data.toString())
        if (cmd === 'state') {
          finish(typeof arg?.turn === 'number' ? { turn: arg.turn } : { error: 'state message had no numeric turn' })
        } else if (cmd === 'error') {
          finish({ error: `server said: ${arg}` })
        }
      } catch {
        // ignore unparseable frames — keep waiting for a real one
      }
    })
    ws.on('error', e => finish({ error: e.message }))
  })
}

export async function syncRally(username: string, password: string, budgetMs: number): Promise<{ games: number; read: number }> {
  const deadline = Date.now() + budgetMs
  const { cookie, games } = await fetchRallyWithSession(username, password)
  const stored = await getRallyGames()
  const activeIds = new Set(games.map(g => g.id.slice('rally:'.length)))

  const updates: RallyPaceGame[] = []
  let read = 0
  let next = 0
  async function worker() {
    while (next < games.length && Date.now() < deadline - CONNECT_TIMEOUT_MS) {
      const g = games[next++]
      const id = g.id.slice('rally:'.length)
      const existing = stored[id]
      const result = await fetchTurn(g.gameUrl, cookie)
      const now = Math.floor(Date.now() / 1000)
      if ('turn' in result) {
        read++
        updates.push({
          id, game: titleFromGameUrl(g.gameUrl), end: null, turn: result.turn,
          playerCount: g.players.length + 1, lastCheckedAt: now,
        })
      } else {
        // Keep whatever turn count we already had — a transient failure
        // shouldn't erase a previously-good reading, only flag the latest attempt
        updates.push({
          ...(existing ?? { id, game: titleFromGameUrl(g.gameUrl), end: null, turn: null }),
          lastError: result.error, lastCheckedAt: now,
        })
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // A game that dropped out of the active list is finished — freeze its last
  // known turn instead of just dropping it (that's the final sample others
  // get compared against)
  for (const [id, g] of Object.entries(stored)) {
    if (g.end === null && !activeIds.has(id)) {
      updates.push({ ...g, end: Math.floor(Date.now() / 1000) })
    }
  }

  await putRallyGames(updates)
  return { games: games.length, read }
}
