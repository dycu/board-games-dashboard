import WebSocket from 'ws'
import { fetchRallyWithSession, HEADERS } from '@/lib/connectors/rally'

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
export async function GET() {
  const username = process.env.RALLY_USERNAME ?? ''
  const password = process.env.RALLY_PASSWORD ?? ''
  if (!username || !password) return Response.json({ error: 'credentials not configured' })

  const { cookie, games } = await fetchRallyWithSession(username, password)
  const target = games.find(g => g.gameName.toLowerCase().includes('caesar')) ?? games[0]
  if (!target) return Response.json({ error: 'no active Rally games found', games: games.map(g => g.gameName) })

  const state = await fetchRawState(target.gameUrl, cookie)
  return Response.json({ gameName: target.gameName, gameUrl: target.gameUrl, state })
}
