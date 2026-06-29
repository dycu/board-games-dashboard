import { Game, Platform, GamesApiResponse, FinishedGame } from '../types'

export type Fetcher = () => Promise<Game[]>
export type FinishedFetcher = () => Promise<FinishedGame[]>
import { fetchBGA, fetchFinishedBGA } from './bga'
import { fetchEighteenXX, fetchFinishedEighteenXX } from './eighteenxx'
import { fetchOBG, fetchFinishedOBG } from './obg'
import { fetchYucata } from './yucata'
import { fetchChoochoo } from './choochoo'
import { fetchHansa } from './hansa'
import { fetchRally, fetchFinishedRally } from './rally'

function env(key: string): string {
  return process.env[key] ?? ''
}

export function makeConnectors(bgaSortCapDays = 3): Record<Platform, Fetcher> {
  return {
    bga: () => fetchBGA(env('BGA_USERNAME'), env('BGA_PASSWORD'), bgaSortCapDays),
    eighteenxx: () => fetchEighteenXX(env('EIGHTEENXX_USERNAME'), env('EIGHTEENXX_PASSWORD')),
    obg: () => fetchOBG(env('OBG_USERNAME'), env('OBG_PASSWORD')),
    yucata: () => fetchYucata(env('YUCATA_USERNAME'), env('YUCATA_PASSWORD')),
    choochoo: () => fetchChoochoo(env('CHOOCHOO_USERNAME'), env('CHOOCHOO_PASSWORD')),
    hansa: () => fetchHansa(env('HANSA_USERNAME'), env('HANSA_PASSWORD')),
    rally: () => fetchRally(env('RALLY_USERNAME'), env('RALLY_PASSWORD')),
  }
}

export const connectors: Record<Platform, Fetcher> = {
  bga: () => fetchBGA(env('BGA_USERNAME'), env('BGA_PASSWORD')),
  eighteenxx: () => fetchEighteenXX(env('EIGHTEENXX_USERNAME'), env('EIGHTEENXX_PASSWORD')),
  obg: () => fetchOBG(env('OBG_USERNAME'), env('OBG_PASSWORD')),
  yucata: () => fetchYucata(env('YUCATA_USERNAME'), env('YUCATA_PASSWORD')),
  choochoo: () => fetchChoochoo(env('CHOOCHOO_USERNAME'), env('CHOOCHOO_PASSWORD')),
  hansa: () => fetchHansa(env('HANSA_USERNAME'), env('HANSA_PASSWORD')),
  rally: () => fetchRally(env('RALLY_USERNAME'), env('RALLY_PASSWORD')),
}

export function makeFinishedConnectors(): Partial<Record<Platform, FinishedFetcher>> {
  return {
    eighteenxx: () => fetchFinishedEighteenXX(env('EIGHTEENXX_USERNAME'), env('EIGHTEENXX_PASSWORD')),
    obg: () => fetchFinishedOBG(env('OBG_USERNAME'), env('OBG_PASSWORD')),
    bga: () => fetchFinishedBGA(env('BGA_USERNAME'), env('BGA_PASSWORD')),
    rally: () => fetchFinishedRally(env('RALLY_USERNAME'), env('RALLY_PASSWORD')),
    choochoo: () => { throw new Error('choochoo must be called via /api/choochoo-finished proxy') },
  }
}

export function hasCreds(platform: Platform): boolean {
  if (platform === 'bga') return !!(process.env.BGA_USERNAME && process.env.BGA_PASSWORD)
  const prefix = platform.toUpperCase()
  return !!(process.env[`${prefix}_USERNAME`] && process.env[`${prefix}_PASSWORD`])
}

export async function fetchAllPlatforms(disabledPlatforms: Platform[] = []): Promise<GamesApiResponse> {
  const entries = (Object.entries(connectors) as [Platform, Fetcher][])
    .filter(([platform]) => hasCreds(platform) && !disabledPlatforms.includes(platform))

  const results = await Promise.allSettled(
    entries.map(async ([platform, fetch]) => {
      const games = await fetch()
      return { platform, games }
    })
  )

  const games: Game[] = []
  const errors: GamesApiResponse['errors'] = []

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      games.push(...result.value.games)
    } else {
      errors.push({
        platform: entries[i][0],
        error: result.reason?.message ?? 'Unknown error',
      })
    }
  })

  return { games, errors, fetchedAt: new Date().toISOString() }
}
