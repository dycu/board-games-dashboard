import { Game, Platform } from '../types'

// Connectors scrape sites that change their markup without notice. A broken
// selector usually doesn't throw — it yields games named "Unknown", or games
// with no link — so such output is turned into an error here, which the
// dashboard shows and the daily health check emails about.
export function checkGames(platform: Platform, games: Pick<Game, 'id' | 'gameName' | 'gameUrl'>[]): void {
  if (games.length === 0) return
  const unnamed = games.filter(g => !g.gameName?.trim() || /^unknown$/i.test(g.gameName.trim()))
  if (games.length >= 2 && unnamed.length === games.length) {
    throw new Error(`${platform}: all ${games.length} games have no name, so the site's markup has probably changed`)
  }
  const unlinked = games.filter(g => !g.gameUrl || !/^https?:\/\//.test(g.gameUrl))
  if (unlinked.length > 0) {
    throw new Error(`${platform}: ${unlinked.length} of ${games.length} games have no link, so the site's markup has probably changed`)
  }
  const ids = new Set(games.map(g => g.id))
  if (ids.size < games.length) {
    throw new Error(`${platform}: ${games.length - ids.size} duplicate game ids, so the site's markup has probably changed`)
  }
}
