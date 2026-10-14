import { fetchRallyWithSession, fetchFinishedRally, HEADERS } from '@/lib/connectors/rally'
import WebSocket from 'ws'

export const runtime = 'nodejs'

const EMPTY_LOG_HASH = 2166136261

function titleFromUrl(gameUrl: string): string {
  return new URL(gameUrl).pathname.split('/').filter(Boolean)[0]
}

function fetchView(gameUrl: string, cookie: string): Promise<{ ok: true; view: any } | { ok: false; error: string }> {
  return new Promise(resolve => {
    const url = new URL(gameUrl)
    const title = titleFromUrl(gameUrl)
    const game = url.searchParams.get('game')
    const role = url.searchParams.get('role') ?? ''
    const wsUrl = `wss://${url.host}/play-socket?title=${title}&game=${game}&role=${encodeURIComponent(role)}&seen=0&hash=${EMPTY_LOG_HASH}`
    let settled = false
    const ws = new WebSocket(wsUrl, { headers: { Cookie: cookie, 'User-Agent': HEADERS['User-Agent'] } })
    const finish = (result: { ok: true; view: any } | { ok: false; error: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ws.close()
      resolve(result)
    }
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), 8000)
    ws.on('message', (data: Buffer) => {
      try {
        const [cmd, arg] = JSON.parse(data.toString())
        if (cmd === 'state') finish({ ok: true, view: arg })
        if (cmd === 'error') finish({ ok: false, error: `server error: ${arg}` })
      } catch { /* ignore */ }
    })
    ws.on('error', e => finish({ ok: false, error: e.message }))
  })
}

export async function GET() {
  const username = process.env.RALLY_USERNAME ?? ''
  const password = process.env.RALLY_PASSWORD ?? ''

  const { cookie, games: active } = await fetchRallyWithSession(username, password)
  const finished = await fetchFinishedRally(username, password)

  // One of each title, active first (more likely connectable), capped to keep this quick
  const byTitle = new Map<string, { gameName: string; gameUrl: string; mode: string }>()
  for (const g of active) byTitle.set(titleFromUrl(g.gameUrl), { gameName: g.gameName, gameUrl: g.gameUrl, mode: 'active' })
  for (const g of finished) if (!byTitle.has(titleFromUrl(g.gameUrl))) byTitle.set(titleFromUrl(g.gameUrl), { gameName: g.gameName, gameUrl: g.gameUrl, mode: 'finished' })

  const entries = [...byTitle.entries()].slice(0, 20)
  const results = []
  for (const [title, g] of entries) {
    const result = await fetchView(g.gameUrl, cookie)
    results.push({
      title, gameName: g.gameName, mode: g.mode,
      ...(result.ok
        ? { ok: true, turn: result.view?.turn, turnType: typeof result.view?.turn, keys: Object.keys(result.view ?? {}) }
        : { ok: false, error: result.error }),
    })
  }

  return Response.json({ activeCount: active.length, finishedCount: finished.length, titlesChecked: entries.length, results })
}
