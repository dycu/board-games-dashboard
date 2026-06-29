# Background Fetch & Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show cached game data instantly on page load, fetch fresh data in the background, and let the user apply updates via a banner without blocking the UI.

**Architecture:** A new `useGamesData` hook extracts all SSE fetch, localStorage cache, and state-machine logic from `page.tsx`. Two new components — `FetchProgress` (compact per-platform strip) and `PendingUpdateBanner` (apply fresh data) — replace the full-page spinner. `page.tsx` becomes a thin composition layer.

**Tech Stack:** Next.js (edge + client), React hooks, localStorage, SSE (no new dependencies)

## Global Constraints

- All client components must have `'use client'` as the first line
- `AGENTS.md` requires checking `node_modules/next/dist/docs/` before writing any Next.js-specific code
- `/api/games` route must **not** be modified — it stays edge runtime, SSE streaming, unchanged
- Follow existing Tailwind dark-slate colour palette (`slate-800`, `slate-400`, `green-400`, `red-400`, etc.)
- No new npm dependencies
- TypeScript strict — no implicit `any` except where explicitly cast on SSE event payloads (already done in existing code)
- Test command: `npx jest`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `hooks/useGamesData.ts` | Cache read/write, SSE fetch, state machine |
| **Create** | `components/FetchProgress.tsx` | Per-platform progress strip (compact or full) |
| **Create** | `components/PendingUpdateBanner.tsx` | "Fresh data ready — Apply" banner |
| **Modify** | `components/GameGrid.tsx` | Real refresh button with spinner and error note |
| **Modify** | `app/page.tsx` | Thin composition using hook + new components |

---

## Task 1: `useGamesData` hook

**Files:**
- Create: `hooks/useGamesData.ts`

**Interfaces — Produces (used by Tasks 4 & 5):**
```ts
export type PlatformStatus =
  | { state: 'loading' }
  | { state: 'done'; count: number }
  | { state: 'error' }

export interface UseGamesDataResult {
  displayedData: GamesApiResponse | null
  pendingData: GamesApiResponse | null
  isRefreshing: boolean
  lastError: string | null
  platformStatuses: Partial<Record<Platform, PlatformStatus>>
  hasCache: boolean
  cachedAt: string | null      // ISO string, time of last successful cache write
  triggerRefresh: () => void
  applyPendingData: () => void
}
```

- [ ] **Step 1: Create the hook file with cache helpers**

Create `hooks/useGamesData.ts`:

```typescript
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Game, GamesApiResponse, Platform } from '@/lib/types'

const CACHE_KEY = 'games-cache'

export type PlatformStatus =
  | { state: 'loading' }
  | { state: 'done'; count: number }
  | { state: 'error' }

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

function readCache(): { data: GamesApiResponse; cachedAt: string } | null {
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
  pendingData: GamesApiResponse | null
  isRefreshing: boolean
  lastError: string | null
  platformStatuses: Partial<Record<Platform, PlatformStatus>>
  hasCache: boolean
  cachedAt: string | null
  triggerRefresh: () => void
  applyPendingData: () => void
}

export function useGamesData(): UseGamesDataResult {
  const [displayedData, setDisplayedData] = useState<GamesApiResponse | null>(null)
  const [pendingData, setPendingData] = useState<GamesApiResponse | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [platformStatuses, setPlatformStatuses] = useState<Partial<Record<Platform, PlatformStatus>>>({})
  const [hasCache, setHasCache] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const fetchingRef = useRef(false)
  // true once displayedData has been shown (from cache or first fetch) — routes
  // subsequent fetch completions to pendingData instead of displayedData.
  const hasDisplayedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const runFetch = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsRefreshing(true)
    setLastError(null)

    let allGames: Game[] = []
    let allErrors: GamesApiResponse['errors'] = []

    try {
      const res = await fetch('/api/games', { signal: controller.signal })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

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
            setPlatformStatuses(
              Object.fromEntries(event.platforms.map((p: Platform) => [p, { state: 'loading' }]))
            )
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
            const freshData: GamesApiResponse = {
              games: allGames,
              errors: allErrors,
              fetchedAt: event.fetchedAt,
            }
            const newCachedAt = writeCache(freshData)
            setCachedAt(newCachedAt)
            if (hasDisplayedRef.current) {
              setPendingData(freshData)
            } else {
              setDisplayedData(freshData)
              hasDisplayedRef.current = true
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setLastError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setIsRefreshing(false)
      fetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setDisplayedData(cached.data)
      setHasCache(true)
      setCachedAt(cached.cachedAt)
      hasDisplayedRef.current = true
    }
    runFetch()
    return () => { abortRef.current?.abort() }
  }, [runFetch])

  const triggerRefresh = useCallback(() => { runFetch() }, [runFetch])

  const applyPendingData = useCallback(() => {
    setPendingData(prev => {
      if (prev) setDisplayedData(prev)
      return null
    })
    setLastError(null)
  }, [])

  return {
    displayedData,
    pendingData,
    isRefreshing,
    lastError,
    platformStatuses,
    hasCache,
    cachedAt,
    triggerRefresh,
    applyPendingData,
  }
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx jest`
Expected: all existing tests pass (the hook has no unit tests — it is covered by manual verification in Task 5)

- [ ] **Step 3: Commit**

```bash
git add hooks/useGamesData.ts
git commit -m "feat: add useGamesData hook with localStorage cache and background SSE fetch"
```

---

## Task 2: `FetchProgress` component

**Files:**
- Create: `components/FetchProgress.tsx`

**Interfaces — Consumes (from Task 1):**
```ts
import { PlatformStatus } from '@/hooks/useGamesData'
```

- [ ] **Step 1: Create the component**

Create `components/FetchProgress.tsx`:

```tsx
'use client'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import { PlatformStatus } from '@/hooks/useGamesData'

interface Props {
  platformStatuses: Partial<Record<Platform, PlatformStatus>>
  compact?: boolean
}

export default function FetchProgress({ platformStatuses, compact = false }: Props) {
  const platforms = Object.keys(platformStatuses) as Platform[]

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-6 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-500">
        <span className="animate-pulse">⟳ Refreshing…</span>
        {platforms.map(p => {
          const status = platformStatuses[p]
          const state = status?.state ?? 'loading'
          return (
            <span key={p} className="flex items-center gap-1">
              <span className={
                state === 'done' ? 'text-green-400' :
                state === 'error' ? 'text-red-400' :
                'text-slate-500'
              }>
                {state === 'done' ? '✓' : state === 'error' ? '✗' : '⟳'}
              </span>
              <span className={state === 'loading' ? 'animate-pulse' : ''}>
                {PLATFORM_LABELS[p]}
              </span>
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="text-slate-300 text-sm">Fetching your games…</div>
        {platforms.length > 0 && (
          <div className="flex flex-col gap-2 text-sm">
            {platforms.map(p => {
              const status = platformStatuses[p]
              const state = status?.state ?? 'loading'
              return (
                <div key={p} className={`flex items-center gap-2 ${state === 'loading' ? 'animate-pulse' : ''}`}>
                  <span className={
                    state === 'done' ? 'text-green-400 w-4 text-center' :
                    state === 'error' ? 'text-red-400 w-4 text-center' :
                    'text-slate-500 w-4 text-center'
                  }>
                    {state === 'done' ? '✓' : state === 'error' ? '✗' : '⟳'}
                  </span>
                  <span className={state === 'loading' ? 'text-slate-500' : 'text-slate-300'}>
                    {PLATFORM_LABELS[p]}
                  </span>
                  <span className="text-slate-600 text-xs">
                    {state === 'done' && `— ${(status as { state: 'done'; count: number }).count} games`}
                    {state === 'error' && '— failed'}
                    {state === 'loading' && '— loading…'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx jest`
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add components/FetchProgress.tsx
git commit -m "feat: add FetchProgress component (compact strip and full-area variants)"
```

---

## Task 3: `PendingUpdateBanner` component

**Files:**
- Create: `components/PendingUpdateBanner.tsx`

**Interfaces — Consumes:**
```ts
import { GamesApiResponse } from '@/lib/types'
pendingData: GamesApiResponse
onApply: () => void
```

- [ ] **Step 1: Create the component**

Create `components/PendingUpdateBanner.tsx`:

```tsx
'use client'
import { GamesApiResponse } from '@/lib/types'

interface Props {
  pendingData: GamesApiResponse
  onApply: () => void
}

export default function PendingUpdateBanner({ pendingData, onApply }: Props) {
  const fetchedAt = new Date(pendingData.fetchedAt).toLocaleTimeString()
  return (
    <div className="flex items-center gap-3 px-6 py-2 bg-slate-800 border-b border-slate-700 text-sm">
      <span className="text-slate-300">↻ Fresh data ready (fetched at {fetchedAt})</span>
      <button
        onClick={onApply}
        className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-md"
      >
        Apply
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx jest`
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add components/PendingUpdateBanner.tsx
git commit -m "feat: add PendingUpdateBanner component"
```

---

## Task 4: Update `GameGrid`

**Files:**
- Modify: `components/GameGrid.tsx`

**Interfaces — Consumes (new props):**
```ts
onRefresh: () => void
isRefreshing: boolean
lastError: string | null
cachedAt: string | null
```

- [ ] **Step 1: Add `timeAgo` helper and update Props interface**

Open `components/GameGrid.tsx`. Add the helper function **above** the component, and extend the Props interface.

Replace the existing `interface Props` block:
```ts
interface Props {
  data: GamesApiResponse
  prefs: UserPrefs
  onPrefsChange: (p: UserPrefs) => void
  dismissed: Set<string>
  onDismiss: (id: string) => void
}
```
with:
```ts
interface Props {
  data: GamesApiResponse
  prefs: UserPrefs
  onPrefsChange: (p: UserPrefs) => void
  dismissed: Set<string>
  onDismiss: (id: string) => void
  onRefresh: () => void
  isRefreshing: boolean
  lastError: string | null
  cachedAt: string | null
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
```

- [ ] **Step 2: Destructure new props in the component signature**

Replace:
```ts
export default function GameGrid({ data, prefs, onPrefsChange, dismissed, onDismiss }: Props) {
```
with:
```ts
export default function GameGrid({ data, prefs, onPrefsChange, dismissed, onDismiss, onRefresh, isRefreshing, lastError, cachedAt }: Props) {
```

- [ ] **Step 3: Replace the refresh `<a>` with a real button and add error note**

In the header `<div>` containing the Settings and Refresh links, replace:
```tsx
          <a href="/" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
            ↻ Refresh
          </a>
```
with:
```tsx
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-md flex items-center gap-1.5"
          >
            <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>
            Refresh
          </button>
```

Then, immediately after the closing `</div>` of the header block (after the `</div>` that wraps the Settings + Refresh buttons), add the error note. The full header section should end up as:

```tsx
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold">Board Games Dashboard</h1>
          <p className="text-sm text-slate-500">
            {games.length}{' '}active &nbsp;·&nbsp;
            <span className="text-blue-400 font-medium">{myTurnCount} your turn</span>
            &nbsp;·&nbsp; updated {new Date(fetchedAt).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/setup" className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md">
            ⚙ Settings
          </a>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-md flex items-center gap-1.5"
          >
            <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>
            Refresh
          </button>
        </div>
      </div>
      {lastError && cachedAt && (
        <div className="mb-2 text-xs text-amber-500">
          Last refresh failed — showing cache from {timeAgo(cachedAt)}
        </div>
      )}
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npx jest`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add components/GameGrid.tsx
git commit -m "feat: replace GameGrid refresh link with real button; add loading and error states"
```

---

## Task 5: Wire up `page.tsx`

**Files:**
- Modify: `app/page.tsx`

**Interfaces — Consumes (from Tasks 1–4):**
- `useGamesData()` → `UseGamesDataResult`
- `<FetchProgress platformStatuses={...} compact? />`
- `<PendingUpdateBanner pendingData={...} onApply={...} />`
- `<GameGrid ... onRefresh isRefreshing lastError cachedAt />`

- [ ] **Step 1: Rewrite `app/page.tsx`**

Replace the entire contents of `app/page.tsx` with:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { UserPrefs, DEFAULT_PREFS } from '@/lib/types'
import { useGamesData } from '@/hooks/useGamesData'
import GameGrid from '@/components/GameGrid'
import PlaySidebar from '@/components/PlaySidebar'
import FetchProgress from '@/components/FetchProgress'
import PendingUpdateBanner from '@/components/PendingUpdateBanner'

const DISMISSED_KEY = 'dismissed-games'

export default function DashboardPage() {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const {
    displayedData,
    pendingData,
    isRefreshing,
    lastError,
    platformStatuses,
    triggerRefresh,
    applyPendingData,
    cachedAt,
  } = useGamesData()

  useEffect(() => {
    const stored = localStorage.getItem(DISMISSED_KEY)
    setDismissed(stored ? new Set(JSON.parse(stored)) : new Set())
    fetch('/api/prefs').then(r => r.json()).then(setPrefs).catch(() => {})
  }, [])

  // Prune dismissed IDs for games that are no longer active whenever
  // displayedData changes (same pruning logic as the original page.tsx).
  useEffect(() => {
    if (!displayedData) return
    const activeIds = new Set(displayedData.games.map(g => g.id))
    setDismissed(prev => {
      const pruned = new Set([...prev].filter(id => !activeIds.has(id)))
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...pruned]))
      return pruned
    })
  }, [displayedData])

  const handleDismiss = (id: string) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const showFullProgress = !displayedData && isRefreshing
  const showCompactProgress = !!displayedData && isRefreshing

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {showCompactProgress && (
          <FetchProgress platformStatuses={platformStatuses} compact />
        )}
        {pendingData && (
          <PendingUpdateBanner pendingData={pendingData} onApply={applyPendingData} />
        )}
        {showFullProgress ? (
          <FetchProgress platformStatuses={platformStatuses} />
        ) : displayedData ? (
          <GameGrid
            data={displayedData}
            prefs={prefs}
            onPrefsChange={setPrefs}
            dismissed={dismissed}
            onDismiss={handleDismiss}
            onRefresh={triggerRefresh}
            isRefreshing={isRefreshing}
            lastError={lastError}
            cachedAt={cachedAt}
          />
        ) : lastError ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-red-400 mb-3">Failed to load games</p>
              <button
                onClick={triggerRefresh}
                className="text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 px-3 py-1.5 rounded-md"
              >
                ↻ Try again
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <PlaySidebar
        games={(displayedData?.games ?? []).filter(g => !dismissed.has(g.id))}
        pins={prefs.pins}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx jest`
Expected: all pass

- [ ] **Step 3: Manual verification — first load (no cache)**

1. Open DevTools → Application → Local Storage → delete `games-cache` key if present
2. Run `npm run dev`, open `http://localhost:3000`
3. Expected: page shell visible immediately, compact progress strip animating in header, grid area shows `FetchProgress` (full variant) with per-platform `⟳` → `✓`/`✗` progress
4. After fetch completes: `GameGrid` renders with all games; `FetchProgress` disappears
5. Check Local Storage: `games-cache` key now exists with `data` and `cachedAt` fields

- [ ] **Step 4: Manual verification — revisit (cache exists)**

1. With cache written from Step 3, reload the page
2. Expected: `GameGrid` renders instantly from cache; compact progress strip appears at top
3. After background fetch completes: compact strip disappears; `PendingUpdateBanner` appears
4. Click **Apply**: grid updates with fresh data, banner disappears

- [ ] **Step 5: Manual verification — manual refresh**

1. With `GameGrid` showing, click the **↻ Refresh** button
2. Expected: button shows spinning `↻`, is disabled; compact progress strip appears
3. After fetch: `PendingUpdateBanner` appears; click **Apply** to update

- [ ] **Step 6: Manual verification — network failure**

1. Open DevTools → Network → set to "Offline"
2. Click **↻ Refresh**
3. Expected: button spins briefly, then shows `"Last refresh failed — showing cache from Xm ago"` note below the header; `GameGrid` stays intact

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire background fetch cache into dashboard page"
```

---

## Self-Review

**Spec coverage:**
- ✓ Show cached data immediately on mount → `readCache()` in `useEffect`, `setDisplayedData(cached.data)`
- ✓ Background fetch runs silently when cache exists → `runFetch()` always called on mount
- ✓ UI updates via banner not auto-swap → `hasDisplayedRef` routes to `setPendingData` when already displaying
- ✓ Manual refresh button → `triggerRefresh` wired to `GameGrid` button
- ✓ Loading indicator on button only, not full-page → `isRefreshing` prop on `GameGrid`
- ✓ First load compact progress → `FetchProgress` in `page.tsx` layout
- ✓ Error with staleness → `lastError && cachedAt` block in `GameGrid`
- ✓ localStorage unavailable → try/catch in `readCache`/`writeCache`
- ✓ `/setup` redirect on 0 platforms → preserved in `runFetch`

**Placeholder scan:** None found.

**Type consistency:**
- `PlatformStatus` exported from `hooks/useGamesData.ts`, imported in `FetchProgress.tsx` ✓
- `UseGamesDataResult.cachedAt` used as `cachedAt` prop in `GameGrid` ✓
- `onRefresh`, `isRefreshing`, `lastError`, `cachedAt` defined in `Props` and passed from `page.tsx` ✓
- `applyPendingData` in hook matches `onApply` callback passed to `PendingUpdateBanner` ✓
