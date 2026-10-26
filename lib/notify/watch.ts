import { StreamedGame } from './types'

// game id → true while it's been notified for the CURRENT my-turn streak, so
// a watched game you haven't moved on yet doesn't push again every check
export type WatchState = Record<string, boolean>

// The distinct platforms behind a set of watched game ids ("rally:262709" ->
// "rally") — lets the frequently-pinged watch cron fetch only those
// platforms instead of every connector on every check.
export function watchedPlatforms(watchedIds: string[]): string[] {
  return [...new Set(watchedIds.map(id => id.split(':')[0]))]
}

export function newlyMyTurn(games: StreamedGame[], watchedIds: string[], before: WatchState): { toNotify: StreamedGame[]; state: WatchState } {
  const watched = new Set(watchedIds)
  const state: WatchState = {}
  const toNotify: StreamedGame[] = []
  for (const g of games) {
    if (!watched.has(g.id) || !g.myTurn) continue
    if (!before[g.id]) toNotify.push(g)
    state[g.id] = true
  }
  return { toNotify, state }
}
