import { fetchProfileGames } from '../connectors/eighteenxx'
import { setEighteenxxSamples, EighteenxxSamples } from './store'

// Unlike BGA/Rally, there's no incremental history to track — the profile
// page already lists every finished/archived game (up to the last 100) with
// its final turn number, so this just regroups that single fetch by title.
export async function syncEighteenxx(username: string, password: string, sessionCookie?: string): Promise<{ titles: number; games: number }> {
  const { myId, games } = await fetchProfileGames(username, password, sessionCookie)

  const samples: EighteenxxSamples = {}
  let count = 0
  for (const g of games) {
    if (g.status !== 'finished' && g.status !== 'archived') continue
    if (!(g.players ?? []).some((p: any) => p.id === myId)) continue
    if (typeof g.turn !== 'number' || g.turn <= 0) continue
    const title = g.title ?? 'Unknown'
    const playerCount = (g.players ?? []).length
    ;(samples[title] ??= []).push({ turn: g.turn, playerCount })
    count++
  }

  await setEighteenxxSamples(samples)
  return { titles: Object.keys(samples).length, games: count }
}
