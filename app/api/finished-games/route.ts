import { makeFinishedConnectors, hasCreds } from '@/lib/connectors'
import { Platform } from '@/lib/types'
import { getPrefs } from '@/lib/prefs'
import { withTimeout } from '@/lib/connectors/utils'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// See /api/games/route.ts: `maxDuration` does NOT raise this edge runtime's
// real ~25s execution ceiling (measured empirically) — STREAM_DEADLINE_MS
// below is the real safeguard.

const PROXY_PATH: Partial<Record<Platform, string>> = {
  choochoo: '/api/choochoo-finished',
}

const PLATFORM_TIMEOUT_MS = 12_000

// Rally's login solves a CPU-bound ALTCHA proof-of-work challenge first, so
// it needs more headroom than other platforms, but still under STREAM_DEADLINE_MS.
const PLATFORM_TIMEOUT_OVERRIDES: Partial<Record<Platform, number>> = { rally: 16_000 }
const timeoutFor = (platform: Platform) => PLATFORM_TIMEOUT_OVERRIDES[platform] ?? PLATFORM_TIMEOUT_MS

// Hard backstop, independent of individual platform timeouts: "done" is
// always sent by this point. Measured safe at 20s; this leaves real margin
// below the ~25s wall.
const STREAM_DEADLINE_MS = 18_000

export async function GET(request?: Request) {
  const prefs = await getPrefs()
  const connectors = makeFinishedConnectors(prefs)
  const entries = (Object.entries(connectors) as [Platform, () => Promise<any>][])
    .filter(([p]) => hasCreds(p) || (p === 'eighteenxx' && !!prefs.eighteenxxSessionCookie))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (data: object) => {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      send({ type: 'start', platforms: entries.map(([p]) => p) })
      const pending = new Set(entries.map(([p]) => p))

      const settled = Promise.allSettled(
        entries.map(async ([platform, fetcher]) => {
          try {
            let games: any[]
            const proxyPath = PROXY_PATH[platform]
            if (proxyPath) {
              const origin = request ? new URL(request.url).origin : 'http://localhost:3000'
              const authHeader = request?.headers.get('authorization')
              const res = await withTimeout(fetch(`${origin}${proxyPath}`, {
                headers: authHeader ? { Authorization: authHeader } : {},
              }), timeoutFor(platform), platform)
              const json = await res.json() as any
              if (json.error) throw new Error(json.error)
              games = json.games ?? []
            } else {
              games = await withTimeout(fetcher(), timeoutFor(platform), platform)
            }
            send({ type: 'platform', platform, games, error: null })
          } catch (e) {
            send({ type: 'platform', platform, games: [], error: e instanceof Error ? e.message : String(e) })
          } finally {
            pending.delete(platform)
          }
        })
      )

      let deadlineTimer: ReturnType<typeof setTimeout>
      const deadline = new Promise(resolve => { deadlineTimer = setTimeout(resolve, STREAM_DEADLINE_MS) })
      await Promise.race([settled, deadline])
      clearTimeout(deadlineTimer!)

      for (const platform of pending) {
        send({ type: 'platform', platform, games: [], error: `${platform} timed out` })
      }

      send({ type: 'done', fetchedAt: new Date().toISOString() })
      closed = true
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
