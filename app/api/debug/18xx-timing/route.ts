import { getPrefs } from '@/lib/prefs'
import { fetchEighteenXX } from '@/lib/connectors/eighteenxx'
import { fetchRally } from '@/lib/connectors/rally'

export async function GET() {
  const prefs = await getPrefs()

  // Alone, to see if the connector itself is slow right now
  const t0 = Date.now()
  let aloneResult: any
  try {
    const games = await fetchEighteenXX(process.env.EIGHTEENXX_USERNAME ?? '', process.env.EIGHTEENXX_PASSWORD ?? '', prefs.eighteenxxSessionCookie)
    aloneResult = { ok: true, count: games.length }
  } catch (e) {
    aloneResult = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  const aloneMs = Date.now() - t0

  // Alongside Rally (which does CPU-bound ALTCHA proof-of-work) at the same time,
  // like the real /api/games route runs every platform concurrently
  const t1 = Date.now()
  let withRally: any
  const results = await Promise.allSettled([
    fetchEighteenXX(process.env.EIGHTEENXX_USERNAME ?? '', process.env.EIGHTEENXX_PASSWORD ?? '', prefs.eighteenxxSessionCookie),
    fetchRally(process.env.RALLY_USERNAME ?? '', process.env.RALLY_PASSWORD ?? ''),
  ])
  withRally = {
    eighteenxx: results[0].status === 'fulfilled' ? { ok: true, count: results[0].value.length } : { ok: false, error: String((results[0] as any).reason) },
    rally: results[1].status === 'fulfilled' ? { ok: true, count: results[1].value.length } : { ok: false, error: String((results[1] as any).reason) },
  }
  const withRallyMs = Date.now() - t1

  return Response.json({ aloneMs, aloneResult, withRallyMs, withRally })
}
