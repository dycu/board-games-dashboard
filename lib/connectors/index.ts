import { Game, Platform, FinishedGame } from '../types'

export type Fetcher = () => Promise<Game[]>
export type FinishedFetcher = () => Promise<FinishedGame[]>
import { fetchBGA, fetchFinishedBGA } from './bga'
import { fetchEighteenXX, fetchFinishedEighteenXX } from './eighteenxx'
import { fetchOBG, fetchFinishedOBG } from './obg'
import { fetchYucata, fetchFinishedYucata } from './yucata'
import { fetchHansa, fetchFinishedHansa } from './hansa'
import { fetchRally, fetchFinishedRally } from './rally'
import { fetchOldKingsCrown } from './oldkingscrown'

function env(key: string): string {
  return process.env[key] ?? ''
}

// choochoo needs Node's https module, so callers on the edge runtime go through
// the /api/choochoo and /api/choochoo-finished routes instead (PROXY_PATH)
function viaProxy(route: string): never {
  throw new Error(`choochoo must be called via the ${route} proxy`)
}

export function makeConnectors(bgaSortCapDays = 3, eighteenxxSessionCookie?: string): Record<Platform, Fetcher> {
  return {
    bga: () => fetchBGA(env('BGA_USERNAME'), env('BGA_PASSWORD'), bgaSortCapDays),
    eighteenxx: () => fetchEighteenXX(env('EIGHTEENXX_USERNAME'), env('EIGHTEENXX_PASSWORD'), eighteenxxSessionCookie),
    obg: () => fetchOBG(env('OBG_USERNAME'), env('OBG_PASSWORD')),
    yucata: () => fetchYucata(env('YUCATA_USERNAME'), env('YUCATA_PASSWORD')),
    choochoo: () => viaProxy('/api/choochoo'),
    hansa: () => fetchHansa(env('HANSA_USER_ID')),
    rally: () => fetchRally(env('RALLY_USERNAME'), env('RALLY_PASSWORD')),
    oldkingscrown: () => fetchOldKingsCrown(env('OLDKINGSCROWN_NICKNAME') || 'Dycu'),
  }
}

export function makeFinishedConnectors(eighteenxxSessionCookie?: string): Partial<Record<Platform, FinishedFetcher>> {
  return {
    eighteenxx: () => fetchFinishedEighteenXX(env('EIGHTEENXX_USERNAME'), env('EIGHTEENXX_PASSWORD'), eighteenxxSessionCookie),
    obg: () => fetchFinishedOBG(env('OBG_USERNAME'), env('OBG_PASSWORD')),
    bga: () => fetchFinishedBGA(env('BGA_USERNAME'), env('BGA_PASSWORD')),
    rally: () => fetchFinishedRally(env('RALLY_USERNAME'), env('RALLY_PASSWORD')),
    hansa: () => fetchFinishedHansa(env('HANSA_USER_ID')),
    yucata: () => fetchFinishedYucata(env('YUCATA_USERNAME'), env('YUCATA_PASSWORD')),
    choochoo: () => viaProxy('/api/choochoo-finished'),
  }
}

export function hasCreds(platform: Platform): boolean {
  if (platform === 'bga') return !!(process.env.BGA_USERNAME && process.env.BGA_PASSWORD)
  if (platform === 'hansa') return !!(process.env.HANSA_USER_ID)
  if (platform === 'oldkingscrown') return true // no account system — only a nickname, defaulted in the connector itself
  const prefix = platform.toUpperCase()
  return !!(process.env[`${prefix}_USERNAME`] && process.env[`${prefix}_PASSWORD`])
}
