import { diffSource, NewGameEvent, NewGamesSource, SourceSnapshot, WatchedItem } from './diff'
import { newGamesEmail } from './email'

export interface CheckDeps {
  sources: Partial<Record<NewGamesSource, () => Promise<WatchedItem[]>>>
  getSnapshot: (source: NewGamesSource) => Promise<SourceSnapshot | null>
  setSnapshot: (source: NewGamesSource, snapshot: SourceSnapshot) => Promise<void>
  addEvents: (events: NewGameEvent[]) => Promise<void>
  sendEmail: (subject: string, text: string, html: string) => Promise<{ sent: boolean; reason?: string }>
}

export interface CheckResult {
  events: NewGameEvent[]
  counts: Partial<Record<NewGamesSource, number>>
  errors: Partial<Record<NewGamesSource, string>>
  baseline: NewGamesSource[] // sources checked for the first time (recorded, nothing reported)
  email?: { sent: boolean; reason?: string }
}

// A failing source keeps its old snapshot and reports nothing this time
export async function checkNewGames(deps: CheckDeps, now = new Date()): Promise<CheckResult> {
  const at = now.toISOString()
  const result: CheckResult = { events: [], counts: {}, errors: {}, baseline: [] }

  await Promise.all((Object.entries(deps.sources) as [NewGamesSource, () => Promise<WatchedItem[]>][]).map(async ([source, fetchItems]) => {
    try {
      const [items, previous] = await Promise.all([fetchItems(), deps.getSnapshot(source)])
      const { snapshot, events } = diffSource(source, previous, items, at)
      await deps.setSnapshot(source, snapshot)
      result.counts[source] = items.length
      if (!previous) result.baseline.push(source)
      result.events.push(...events)
    } catch (e) {
      result.errors[source] = e instanceof Error ? e.message : String(e)
    }
  }))

  if (result.events.length > 0) {
    await deps.addEvents(result.events)
    const { subject, text, html } = newGamesEmail(result.events)
    result.email = await deps.sendEmail(subject, text, html)
  }
  return result
}
