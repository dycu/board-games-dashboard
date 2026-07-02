import { makeConnectors, hasCreds } from '@/lib/connectors'
import { Platform } from '@/lib/types'
import { getPrefs } from '@/lib/prefs'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Platforms that can't run in edge runtime — proxied through Node.js endpoints
const PROXY_PATH: Partial<Record<Platform, string>> = {
  choochoo: '/api/choochoo',
}

export async function GET(request?: Request) {
  const prefs = await getPrefs()
  const disabled = prefs.disabledPlatforms ?? []
  const connectors = makeConnectors(prefs.bgaSortCapDays ?? 3, prefs.eighteenxxSessionCookie)

  const entries = (Object.entries(connectors) as [Platform, () => Promise<any>][])
    .filter(([p]) =>
      (hasCreds(p) || (p === 'eighteenxx' && !!prefs.eighteenxxSessionCookie))
      && !disabled.includes(p)
    )

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
              const authHeader = request?.headers.get('authorization')
              const res = await fetch(`${origin}${proxyPath}`, {
                headers: authHeader ? { Authorization: authHeader } : {},
              })
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
