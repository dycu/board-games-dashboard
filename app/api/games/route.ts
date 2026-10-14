import { makeConnectors, hasCreds } from '@/lib/connectors'
import { Platform } from '@/lib/types'
import { getPrefs } from '@/lib/prefs'
import { recordLoadSample, LoadSample } from '@/lib/pace/loadSamples'
import { checkGames } from '@/lib/connectors/validate'
import { withTimeout } from '@/lib/connectors/utils'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// NOTE: `maxDuration` does NOT raise this edge runtime's real execution
// ceiling — measured empirically (temporary /api/debug/edge-duration probe,
// since removed) at a hard ~25s FUNCTION_INVOCATION_TIMEOUT regardless of
// what's exported here. STREAM_DEADLINE_MS below is the real safeguard:
// everything must fit under that, with margin, or Vercel kills the whole
// function before "done" is ever sent — producing a truncated stream
// instead of a reported per-platform error (this is what made the cron
// emails intermittently fail to load the dashboard's games at all
// even though the dashboard itself looked fine).

// Platforms that can't run in edge runtime — proxied through Node.js endpoints
const PROXY_PATH: Partial<Record<Platform, string>> = {
  choochoo: '/api/choochoo',
  oldkingscrown: '/api/oldkingscrown',
}

const PLATFORM_TIMEOUT_MS = 12_000

// Rally's login solves a CPU-bound ALTCHA proof-of-work challenge before it
// can even make its first authenticated request — give it more headroom
// than other platforms get, but still under STREAM_DEADLINE_MS.
const PLATFORM_TIMEOUT_OVERRIDES: Partial<Record<Platform, number>> = { rally: 16_000 }
const timeoutFor = (platform: Platform) => PLATFORM_TIMEOUT_OVERRIDES[platform] ?? PLATFORM_TIMEOUT_MS

// Hard backstop, independent of individual platform timeouts: "done" is
// always sent by this point no matter what any platform is still doing.
// Measured safe (succeeds reliably) at 20s; this leaves real margin below
// the ~25s wall.
const STREAM_DEADLINE_MS = 18_000

export async function GET(request?: Request) {
  const prefs = await getPrefs()
  const disabled = prefs.disabledPlatforms ?? []
  const connectors = makeConnectors(prefs)

  const entries = (Object.entries(connectors) as [Platform, () => Promise<any>][])
    .filter(([p]) =>
      (hasCreds(p) || (p === 'eighteenxx' && !!prefs.eighteenxxSessionCookie))
      && !disabled.includes(p)
    )

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Once the stream deadline forces "done", any platform promise that
      // resolves later (its own timeout was still running) must not try to
      // enqueue on the now-closed controller.
      let closed = false
      const send = (data: object) => {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      send({ type: 'start', platforms: entries.map(([p]) => p) })
      const counts: LoadSample['counts'] = {}
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
            checkGames(platform, games)
            counts[platform] = games.length
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

      // Whatever's still pending past the deadline is reported as timed out
      // instead of silently missing from the response
      for (const platform of pending) {
        send({ type: 'platform', platform, games: [], error: `${platform} timed out` })
      }

      send({ type: 'done', fetchedAt: new Date().toISOString() })
      closed = true
      // After 'done' so the client isn't kept waiting; feeds the Pace page's all-platforms load
      await recordLoadSample(counts)
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
