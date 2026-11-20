import { fetchBgaTournaments } from '@/lib/connectors/bgaTournaments'
import { bgaAuthOptions } from '@/lib/connectors'
import { getPrefs } from '@/lib/prefs'
import { TournamentsApiResponse } from '@/lib/types'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

function env(key: string): string {
  return process.env[key] ?? ''
}

// BGA-only for now — see lib/connectors/bgaTournaments.ts. Returns an empty
// list rather than an error when BGA isn't configured at all, same as the
// main games route treats a platform with no credentials.
export async function GET(): Promise<Response> {
  if (!(process.env.BGA_USERNAME && process.env.BGA_PASSWORD)) {
    return Response.json({ tournaments: [], error: null } satisfies TournamentsApiResponse)
  }

  const prefs = await getPrefs()
  try {
    const tournaments = await fetchBgaTournaments(env('BGA_USERNAME'), env('BGA_PASSWORD'), bgaAuthOptions(prefs))
    return Response.json({ tournaments, error: null } satisfies TournamentsApiResponse)
  } catch (e) {
    return Response.json({ tournaments: [], error: e instanceof Error ? e.message : String(e) } satisfies TournamentsApiResponse)
  }
}
