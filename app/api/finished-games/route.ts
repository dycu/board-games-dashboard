import { makeFinishedConnectors, hasCreds } from '@/lib/connectors'
import { Platform } from '@/lib/types'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const PROXY_PATH: Partial<Record<Platform, string>> = {
  choochoo: '/api/choochoo-finished',
}

export async function GET(request?: Request) {
  const connectors = makeFinishedConnectors()
  const entries = (Object.entries(connectors) as [Platform, () => Promise<any>][])
    .filter(([p]) => hasCreds(p))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      send({ type: 'start', platforms: entries.map(([p]) => p) })

      await Promise.allSettled(
        entries.map(async ([platform, fetcher]) => {
          try {
            let games: any[]
            const proxyPath = PROXY_PATH[platform]
            if (proxyPath) {
              const origin = request ? new URL(request.url).origin : 'http://localhost:3000'
              const res = await fetch(`${origin}${proxyPath}`)
              const json = await res.json() as any
              if (json.error) throw new Error(json.error)
              games = json.games ?? []
            } else {
              games = await fetcher()
            }
            send({ type: 'platform', platform, games, error: null })
          } catch (e) {
            send({ type: 'platform', platform, games: [], error: e instanceof Error ? e.message : String(e) })
          }
        })
      )

      send({ type: 'done', fetchedAt: new Date().toISOString() })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
