import WebSocket from 'ws'
import { kv } from '@vercel/kv'
import { fetchRallyWithSession, HEADERS } from '@/lib/connectors/rally'

// Same key lib/rallyPace/store.ts uses — duplicated here rather than
// exporting a clear-everything helper from it for a route this temporary.
const RALLYPACE_KV_KEY = 'rallypace:v1:games'

export const dynamic = 'force-dynamic'

const EMPTY_LOG_HASH = 2166136261
const CONNECT_TIMEOUT_MS = 8000

function titleFromGameUrl(gameUrl: string): string {
  return new URL(gameUrl).pathname.split('/').filter(Boolean)[0]
}

function fetchRawState(gameUrl: string, cookie: string): Promise<unknown> {
  return new Promise(resolve => {
    const url = new URL(gameUrl)
    const title = titleFromGameUrl(gameUrl)
    const game = url.searchParams.get('game')
    const role = url.searchParams.get('role') ?? ''
    const wsUrl = `wss://${url.host}/play-socket?title=${title}&game=${game}&role=${encodeURIComponent(role)}&seen=0&hash=${EMPTY_LOG_HASH}`

    let settled = false
    const ws = new WebSocket(wsUrl, { headers: { Cookie: cookie, 'User-Agent': HEADERS['User-Agent'] } })
    const finish = (result: unknown) => {
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
        if (cmd === 'state') finish(arg)
        else if (cmd === 'error') finish({ error: `server said: ${arg}` })
      } catch {
        // ignore unparseable frames — keep waiting for a real one
      }
    })
    ws.on('error', e => finish({ error: e.message }))
  })
}

// Temporary diagnostic: does Rally's live "state.turn" count across the
// whole game, or does it reset at the start of each round (as Julius
// Caesar's 5 Years each dealing fresh cards would suggest)? Dumps the raw
// state object for whichever active game looks like Julius Caesar so we can
// see what else is in there (a round/year field, a log length, etc).
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams

  // One-time cleanup: every stored `turn` predates the log-based fix and is
  // on the old, incompatible unit (the game's own per-round turn number) —
  // mixing those into medians with freshly-synced log-based values would
  // corrupt the estimate. Wiping lets it rebuild cleanly from here on.
  if (params.has('clear')) {
    await kv.del(RALLYPACE_KV_KEY)
    return Response.json({ cleared: true })
  }

  const username = process.env.RALLY_USERNAME ?? ''
  const password = process.env.RALLY_PASSWORD ?? ''
  if (!username || !password) return Response.json({ error: 'credentials not configured' })

  const { cookie, games } = await fetchRallyWithSession(username, password)
  const all = params.has('all')
  const targets = all ? games : [games.find(g => g.gameName.toLowerCase().includes('caesar')) ?? games[0]].filter(Boolean)
  if (targets.length === 0) return Response.json({ error: 'no active Rally games found', games: games.map(g => g.gameName) })

  const results = await Promise.all(targets.map(async g => {
    const state = await fetchRawState(g.gameUrl, cookie) as Record<string, unknown>
    const log = state.log
    return {
      gameName: g.gameName,
      gameUrl: g.gameUrl,
      turn: state.turn,
      year: state.year,
      log_start: state.log_start,
      logLength: Array.isArray(log) ? log.length : null,
      hasLog: Array.isArray(log),
      keys: Object.keys(state),
    }
  }))
  return Response.json({ results })
}
