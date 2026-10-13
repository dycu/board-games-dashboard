import { Platform } from '../types'
import { StreamedGame } from './types'

export type PlatformResult = { platform: Platform; count: number } | { platform: Platform; error: string }

export interface GamesStream {
  results: PlatformResult[]
  games: StreamedGame[]
  // Platforms announced in 'start' that never reported (a cut-off stream)
  missing: Platform[]
}

// Reads /api/games' event stream: one 'platform' event per site. A stream
// cut off before 'done' still gives the platforms that did report; only one
// with no platform at all counts as a failure.
export function parseGamesStream(body: string): GamesStream {
  const results: PlatformResult[] = []
  const games: StreamedGame[] = []
  let announced: Platform[] = []
  for (const chunk of body.split('\n\n')) {
    if (!chunk.startsWith('data: ')) continue
    let event: { type?: string; platform?: Platform; platforms?: Platform[]; games?: StreamedGame[]; error?: string | null }
    try { event = JSON.parse(chunk.slice(6)) } catch { continue }
    if (event.type === 'start') {
      announced = event.platforms ?? []
    } else if (event.type === 'platform' && event.platform) {
      results.push(event.error
        ? { platform: event.platform, error: event.error }
        : { platform: event.platform, count: event.games?.length ?? 0 })
      games.push(...(event.games ?? []))
    }
  }
  if (results.length === 0) throw new Error('/api/games stream had no platform results')
  const missing = announced.filter(p => !results.some(r => r.platform === p))
  return { results, games, missing }
}

// The dashboard's own fetch, so proxies, prefs and validation all apply.
// /api/finished-games streams the same way (its games are FinishedGames).
// Tried twice: one slow cold start shouldn't cost a whole email.
export async function fetchGamesStream(origin: string, authorization: string, path = '/api/games'): Promise<GamesStream> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${origin}${path}`, { headers: { Authorization: authorization } })
      if (!res.ok) throw new Error(`${path} HTTP ${res.status}`)
      return parseGamesStream(await res.text())
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

// Basic Auth for the cron's own calls to the dashboard's APIs
export function cronAuthorization(): string {
  return `Basic ${Buffer.from(`${process.env.AUTH_USERNAME ?? ''}:${process.env.AUTH_PASSWORD ?? ''}`).toString('base64')}`
}
