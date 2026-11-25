'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Game, GamesApiResponse, Platform } from '@/lib/types'

const CACHE_KEY = 'games-cache'
const PENDING_DEPARTURES_KEY = 'pending-departures'
const PACE_SYNC_AT_KEY = 'pace-sync-at'
const PACE_SYNC_EVERY_MS = 30 * 60 * 1000
const RALLY_PACE_SYNC_AT_KEY = 'rallypace-sync-at'
const EIGHTEENXX_PACE_SYNC_AT_KEY = 'eighteenxxpace-sync-at'

// BGA deletes a finished game's move log within hours, so the Pace logger has
// to read running games often enough to catch each one's last turns. Piggyback
// on dashboard refreshes, at most every 30 minutes, fire-and-forget.
function maybeSyncPace(): void {
  try {
    const last = Number(localStorage.getItem(PACE_SYNC_AT_KEY) ?? 0)
    if (Date.now() - last < PACE_SYNC_EVERY_MS) return
    localStorage.setItem(PACE_SYNC_AT_KEY, String(Date.now()))
  } catch {
    return
  }
  fetch('/api/pace/sync', { method: 'POST' }).catch(() => {})
}

// Same idea as maybeSyncPace, for Rally's turn-count tracking (lib/rallyPace)
function maybeSyncRallyPace(): void {
  try {
    const last = Number(localStorage.getItem(RALLY_PACE_SYNC_AT_KEY) ?? 0)
    if (Date.now() - last < PACE_SYNC_EVERY_MS) return
    localStorage.setItem(RALLY_PACE_SYNC_AT_KEY, String(Date.now()))
  } catch {
    return
  }
  fetch('/api/rallypace/sync', { method: 'POST' }).catch(() => {})
}

// Same idea again, for 18xx's finished-game turn samples (lib/eighteenxxPace)
function maybeSyncEighteenxxPace(): void {
  try {
    const last = Number(localStorage.getItem(EIGHTEENXX_PACE_SYNC_AT_KEY) ?? 0)
    if (Date.now() - last < PACE_SYNC_EVERY_MS) return
    localStorage.setItem(EIGHTEENXX_PACE_SYNC_AT_KEY, String(Date.now()))
  } catch {
    return
  }
  fetch('/api/eighteenxxpace/sync', { method: 'POST' }).catch(() => {})
}

export interface DepartedGame {
  id: string
  gameName: string
  platform: Platform
  gameUrl: string
}

export function computeDeparted(
  prev: Game[],
  next: Game[],
  errors: { platform: Platform; error: string }[]
): DepartedGame[] {
  const nextIds = new Set(next.map(g => g.id))
  const errorPlatforms = new Set(errors.map(e => e.platform))
  return prev
    .filter(g => !nextIds.has(g.id) && !errorPlatforms.has(g.platform))
    .map(g => ({ id: g.id, gameName: g.gameName, platform: g.platform, gameUrl: g.gameUrl }))
}

// Platforms occasionally omit a still-active game from one response without
// reporting an error (seen on Yucata: an ongoing game vanished from the
// current-games list and its page briefly 404'd). So a game first missing from
// a fetch is only *pending*; it's confirmed as ended if it's still missing on
// the next successful fetch of its platform.
export function resolveDepartures(
  prev: Game[],
  pending: DepartedGame[],
  next: Game[],
  errors: { platform: Platform; error: string }[]
): { confirmed: DepartedGame[]; pending: DepartedGame[] } {
  const nextIds = new Set(next.map(g => g.id))
  const errorPlatforms = new Set(errors.map(e => e.platform))
  const stillMissing = pending.filter(g => !nextIds.has(g.id))
  const confirmed = stillMissing.filter(g => !errorPlatforms.has(g.platform))
  // Platform errored this time — can't tell yet, keep waiting
  const deferred = stillMissing.filter(g => errorPlatforms.has(g.platform))
  const pendingIds = new Set(pending.map(g => g.id))
  const newlyMissing = computeDeparted(prev, next, errors).filter(g => !pendingIds.has(g.id))
  return { confirmed, pending: [...deferred, ...newlyMissing] }
}

export type PlatformStatus =
  | { state: 'loading' }
  | { state: 'done'; count: number }
  | { state: 'error' }

// Merges a platform-scoped refresh's results into the previously known full
// state, keeping every other platform's games/errors untouched. Without
// this, returning from a single game on one platform would replace the
// whole dashboard with just that platform's results, erasing every other
// platform from the UI (and the filter bar) until the next full refresh.
export function mergePlatformRefresh(
  previous: GamesApiResponse | null,
  touchedPlatforms: Platform[],
  freshGames: Game[],
  freshErrors: GamesApiResponse['errors'],
  fetchedAt: string,
): GamesApiResponse {
  if (!previous) return { games: freshGames, errors: freshErrors, fetchedAt, platforms: touchedPlatforms }
  const touched = new Set(touchedPlatforms)
  return {
    games: [...previous.games.filter(g => !touched.has(g.platform)), ...freshGames],
    errors: [...previous.errors.filter(e => !touched.has(e.platform)), ...freshErrors],
    fetchedAt,
    platforms: previous.platforms ?? touchedPlatforms,
  }
}

// A platform-scoped refresh only checked the platforms it asked for, so a
// game on any other platform can't be judged "departed" this round — treat
// every platform outside this refresh as if it had errored, which is
// exactly how resolveDepartures/computeDeparted already defer a judgment
// (instead of confirming one) for a platform that failed to load.
export function departureCheckErrors(
  freshErrors: GamesApiResponse['errors'],
  previousPlatforms: Platform[],
  touchedPlatforms: Platform[],
): GamesApiResponse['errors'] {
  const touched = new Set(touchedPlatforms)
  const untouched = previousPlatforms.filter(p => !touched.has(p))
  return [...freshErrors, ...untouched.map(platform => ({ platform, error: 'not fetched this round' }))]
}

interface StoredGame extends Omit<Game, 'lastMoveAt'> {
  lastMoveAt: string
}

interface GamesCache {
  data: {
    games: StoredGame[]
    errors: GamesApiResponse['errors']
    fetchedAt: string
  }
  cachedAt: string
}

export function readCache(): { data: GamesApiResponse; cachedAt: string } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached: GamesCache = JSON.parse(raw)
    return {
      data: {
        ...cached.data,
        games: cached.data.games.map(g => ({ ...g, lastMoveAt: new Date(g.lastMoveAt) })),
      },
      cachedAt: cached.cachedAt,
    }
  } catch {
    return null
  }
}

function readPendingDepartures(): DepartedGame[] {
  try {
    const raw = localStorage.getItem(PENDING_DEPARTURES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writePendingDepartures(pending: DepartedGame[]): void {
  try {
    localStorage.setItem(PENDING_DEPARTURES_KEY, JSON.stringify(pending))
  } catch {
    // ignore storage errors
  }
}

function writeCache(data: GamesApiResponse): string {
  const cachedAt = new Date().toISOString()
  try {
    const cache: GamesCache = {
      data: {
        ...data,
        games: data.games.map(g => ({ ...g, lastMoveAt: g.lastMoveAt.toISOString() })),
      },
      cachedAt,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // ignore storage errors
  }
  return cachedAt
}

export interface UseGamesDataResult {
  displayedData: GamesApiResponse | null
  isRefreshing: boolean
  lastError: string | null
  platformStatuses: Partial<Record<Platform, PlatformStatus>>
  cachedAt: string | null
  freshDataVersion: number
  freshDataStartedAt: number // when the fetch behind the latest fresh data started
  // force: abort a fetch already running and start over (its data may predate a change)
  // platforms: refresh only these platforms, merging into the rest of the
  // already-known data instead of refetching every configured platform
  triggerRefresh: (force?: boolean, platforms?: Platform[]) => void
  departedGames: DepartedGame[]
}

export function useGamesData(): UseGamesDataResult {
  const [displayedData, setDisplayedData] = useState<GamesApiResponse | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [platformStatuses, setPlatformStatuses] = useState<Partial<Record<Platform, PlatformStatus>>>({})
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [freshDataVersion, setFreshDataVersion] = useState(0)
  const [freshDataStartedAt, setFreshDataStartedAt] = useState(0)
  const [departedGames, setDepartedGames] = useState<DepartedGame[]>([])

  // Platform-scoped refreshes (the return-from-game "just this platform"
  // check, and its settle-delay retries for OBG/BoardTogether) can now be
  // legitimately in flight at the same time as an unrelated one — e.g.
  // returning with both a BGA and a BoardTogether game open fires an
  // immediate BGA-scoped fetch AND, a few seconds later, a delayed
  // BoardTogether-scoped retry. A single shared AbortController used to
  // treat these as one fetch slot, so the later one silently aborted the
  // earlier one's in-flight request — and if that abort didn't reliably
  // reject the earlier fetch's own reader.read() (browser/stream-timing
  // dependent), its "turn isRefreshing back off" cleanup never ran, leaving
  // the refresh indicator (and anything gated on a fetch actually
  // finishing, like the note-prompt popup) stuck until a manual reload
  // reset all of this in-memory state. Tracking each in-flight fetch
  // separately, and only aborting ones that target an overlapping platform
  // set, lets disjoint scoped refreshes run to completion independently.
  const inFlightRef = useRef<{ controller: AbortController; platforms?: Platform[] }[]>([])

  const overlaps = (a?: Platform[], b?: Platform[]) =>
    !a || !b || a.some(p => b.includes(p)) // undefined (a full refresh) touches everything

  const runFetch = useCallback(async (force = false, platforms?: Platform[]) => {
    const conflicting = inFlightRef.current.filter(f => overlaps(f.platforms, platforms))
    if (conflicting.length > 0 && !force) return
    conflicting.forEach(f => f.controller.abort())

    const controller = new AbortController()
    const entry = { controller, platforms }
    inFlightRef.current = [...inFlightRef.current.filter(f => !conflicting.includes(f)), entry]
    const startedAt = Date.now()

    setIsRefreshing(true)
    setLastError(null)
    // Marks the platforms this fetch is about to touch as loading right
    // away, rather than leaving their *previous* fetch's statuses (all
    // 'done') in place until the 'start' SSE event arrives — which briefly
    // showed the compact progress bar as already full, then reset to
    // near-empty once that event landed a beat later. A scoped refresh
    // knows its platforms already; a full one resets every platform
    // already known from the last fetch (the 'start' event fills in any
    // the account has but this hook hasn't seen loading before, e.g. one
    // added since).
    setPlatformStatuses(prev => {
      const toMark = platforms ?? (Object.keys(prev) as Platform[])
      return { ...prev, ...Object.fromEntries(toMark.map(p => [p, { state: 'loading' as const }])) }
    })

    let allGames: Game[] = []
    const allErrors: GamesApiResponse['errors'] = []
    let allPlatforms: Platform[] = []

    try {
      const url = platforms && platforms.length > 0 ? `/api/games?platforms=${platforms.join(',')}` : '/api/games'
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`Server error ${res.status}`)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let receivedDone = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          if (!chunk.startsWith('data: ')) continue
          let event: any
          try { event = JSON.parse(chunk.slice(6)) } catch { continue }

          if (event.type === 'start') {
            if (event.platforms.length === 0) {
              window.location.href = '/setup'
              return
            }
            allPlatforms = event.platforms
            // Merged, not replaced — a concurrent, disjoint scoped fetch's
            // own statuses (e.g. BoardTogether's) must survive this fetch's
            // (e.g. BGA's) own 'start' event landing at the same time.
            setPlatformStatuses(prev => ({
              ...prev,
              ...Object.fromEntries(event.platforms.map((p: Platform) => [p, { state: 'loading' }])),
            }))
          } else if (event.type === 'platform') {
            if (event.error) {
              allErrors.push({ platform: event.platform, error: event.error })
              setPlatformStatuses(prev => ({ ...prev, [event.platform]: { state: 'error' } }))
            } else {
              const games: Game[] = (event.games as any[]).map(g => ({
                ...g,
                lastMoveAt: new Date(g.lastMoveAt),
              }))
              allGames = [...allGames, ...games]
              setPlatformStatuses(prev => ({
                ...prev,
                [event.platform]: { state: 'done', count: event.games.length },
              }))
            }
          } else if (event.type === 'done') {
            receivedDone = true
            const prevCache = readCache()
            const prevData = prevCache?.data ?? null
            const touched = platforms && platforms.length > 0 ? platforms : null

            const freshData: GamesApiResponse = touched
              ? mergePlatformRefresh(prevData, touched, allGames, allErrors, event.fetchedAt)
              : { games: allGames, errors: allErrors, fetchedAt: event.fetchedAt, platforms: allPlatforms }

            const prevGames = prevData?.games ?? []
            // A platform-scoped refresh didn't check any other platform, so
            // its games can't be judged "departed" against this one — defer
            // that judgment the same way an errored platform already does.
            const departureErrors = touched ? departureCheckErrors(allErrors, prevData?.platforms ?? allPlatforms, touched) : allErrors
            const departures = resolveDepartures(prevGames, readPendingDepartures(), allGames, departureErrors)
            writePendingDepartures(departures.pending)
            setDepartedGames(departures.confirmed)
            const newCachedAt = writeCache(freshData)
            setCachedAt(newCachedAt)
            setDisplayedData(freshData)
            setFreshDataStartedAt(startedAt)
            setFreshDataVersion(v => v + 1)
            if (!allErrors.some(e => e.platform === 'bga')) maybeSyncPace()
            if (!allErrors.some(e => e.platform === 'rally')) maybeSyncRallyPace()
            if (!allErrors.some(e => e.platform === 'eighteenxx')) maybeSyncEighteenxxPace()
          }
        }
      }

      if (!receivedDone) throw new Error('Stream ended without completing')
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setLastError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      inFlightRef.current = inFlightRef.current.filter(f => f !== entry)
      if (inFlightRef.current.length === 0) setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
      setDisplayedData(cached.data)
      setCachedAt(cached.cachedAt)
    }
    runFetch()
    return () => {
      inFlightRef.current.forEach(f => f.controller.abort())
      inFlightRef.current = []
    }
  }, [runFetch])

  const triggerRefresh = useCallback((force = false, platforms?: Platform[]) => {
    runFetch(force, platforms)
  }, [runFetch])

  return {
    displayedData,
    isRefreshing,
    lastError,
    platformStatuses,
    cachedAt,
    freshDataVersion,
    freshDataStartedAt,
    triggerRefresh,
    departedGames,
  }
}
