export const runtime = 'nodejs'

import { loginRally, BASE, HEADERS } from '@/lib/connectors/rally'
import WebSocket from 'ws'

export async function GET() {
  const username = process.env.RALLY_USERNAME ?? ''
  const password = process.env.RALLY_PASSWORD ?? ''
  const cookie = await loginRally(username, password)

  const res = await fetch(`${BASE}/games/finished`, { headers: { ...HEADERS, Cookie: cookie } })
  const html = await res.text()
  const chunks = html.split(/(?=<div[^>]+class="[^"]*\bgame_item\b)/)
  const links: string[] = []
  for (const chunk of chunks) {
    const gameId = chunk.match(/href="\/join\/(\d+)"/)?.[1]
    if (!gameId) continue
    const cmdMatch = chunk.match(/<a[^>]+class="command"[^>]+href="([^"]+)"/)
                ?? chunk.match(/href="([^"]+)"[^>]*>(?:Play|Watch|Review)</)
    links.push(`${gameId}: ${cmdMatch?.[1] ?? 'NO MATCH'}`)
  }

  const first = links[0]?.split(': ')[1]
  let wsResult: any = null
  if (first && first !== 'NO MATCH') {
    const url = new URL(first.startsWith('http') ? first : `${BASE}${first.replace(/&amp;/g, '&')}`)
    const title = url.pathname.split('/').filter(Boolean)[0]
    const game = url.searchParams.get('game')
    const role = url.searchParams.get('role') ?? ''
    const wsUrl = `wss://${url.host}/play-socket?title=${title}&game=${game}&role=${encodeURIComponent(role)}&seen=0&hash=2166136261`
    wsResult = await new Promise(resolve => {
      let settled = false
      const ws = new WebSocket(wsUrl, { headers: { Cookie: cookie, 'User-Agent': HEADERS['User-Agent'] } })
      const finish = (r: any) => { if (settled) return; settled = true; clearTimeout(timer); ws.close(); resolve(r) }
      const timer = setTimeout(() => finish({ error: 'timeout' }), 8000)
      ws.on('message', (data: Buffer) => {
        try {
          const [cmd, arg] = JSON.parse(data.toString())
          finish({ cmd, turn: arg?.turn, keys: arg ? Object.keys(arg) : null })
        } catch { /* keep waiting */ }
      })
      ws.on('error', e => finish({ error: e.message }))
    })
    wsResult = { wsUrl, ...wsResult }
  }

  return new Response(JSON.stringify({ count: links.length, sample: links.slice(0, 5), wsResult }, null, 2), { headers: { 'Content-Type': 'application/json' } })
}
