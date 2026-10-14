import { StreamedGame } from './types'

// game id → true while it's been notified for the CURRENT my-turn streak, so
// a watched game you haven't moved on yet doesn't push again every check
export type WatchState = Record<string, boolean>

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
