import { connectors, hasCreds } from '@/lib/connectors'
import { Platform } from '@/lib/types'
import { getPrefs } from '@/lib/prefs'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  const prefs = await getPrefs()
  const disabled = prefs.disabledPlatforms ?? []

  const entries = (Object.entries(connectors) as [Platform, () => Promise<any>][])
    .filter(([p]) => hasCreds(p) && !disabled.includes(p))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      send({ type: 'start', platforms: entries.map(([p]) => p) })

      await Promise.allSettled(
        entries.map(async ([platform, fetch]) => {
          try {
            const games = await fetch()
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
