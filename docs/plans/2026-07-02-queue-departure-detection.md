# Queue Departure Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each successful fetch, diff the new game list against the localStorage cache and surface a dismissable notice listing games that left the user's active queue since their last visit — even after hours away.

**Architecture:** A pure `computeDeparted(prev, next, errors)` function (exported and unit-tested) computes departures. `useGamesData` calls it in the SSE `done` handler (reading the old cache before overwriting it) and exposes `departedGames`. `GameGrid` renders a one-line notice with game links and a dismiss button.

**Tech Stack:** React useState/useEffect/useRef, localStorage (existing cache), TypeScript

## Global Constraints
- Games whose platform reported an error in the new fetch are excluded from departures (false-positive guard)
- `departedGames` is cleared on the next successful fetch (one-refresh ephemeral)
- Notice renders as a single line of text above the platform badges — no modal, no toast
- No backend changes

---

### Task 1: Implement and test computeDeparted

**Files:**
- Modify: `hooks/useGamesData.ts` (export the function)
- Create: `hooks/__tests__/computeDeparted.test.ts`

**Interfaces:**
- Produces: `export function computeDeparted(prev: Game[], next: Game[], errors: { platform: Platform; error: string }[]): DepartedGame[]`
- Produces: `export interface DepartedGame { id: string; gameName: string; platform: Platform; gameUrl: string }`

- [ ] **Step 1: Add DepartedGame type and computeDeparted to useGamesData.ts**

Open `hooks/useGamesData.ts`. After the existing imports, add `DepartedGame` interface and export `computeDeparted`. Insert after the `CACHE_KEY` constant:

```ts
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
```

- [ ] **Step 2: Write failing tests**

Create `hooks/__tests__/computeDeparted.test.ts`:

```ts
import { computeDeparted, DepartedGame } from '../useGamesData'
import { Game, Platform } from '@/lib/types'

const makeGame = (id: string, platform: Platform = 'bga'): Game => ({
  id,
  platform,
  gameName: `Game ${id}`,
  myTurn: false,
  lastMoveAt: new Date(),
  lastMoveAgo: '1h ago',
  urgent: false,
  gameUrl: `https://example.com/${id}`,
  platformUrl: 'https://boardgamearena.com',
  players: [],
})

describe('computeDeparted', () => {
  it('returns game present in prev but absent in next', () => {
    const prev = [makeGame('bga:1'), makeGame('bga:2')]
    const next = [makeGame('bga:1')]
    const result = computeDeparted(prev, next, [])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('bga:2')
    expect(result[0].gameName).toBe('Game bga:2')
  })

  it('excludes departures from platforms that errored', () => {
    const prev = [makeGame('bga:1'), makeGame('obg:1', 'obg')]
    const next = [makeGame('bga:1')]
    const errors = [{ platform: 'obg' as Platform, error: 'timeout' }]
    const result = computeDeparted(prev, next, errors)
    expect(result).toHaveLength(0)
  })

  it('returns bga departure even when obg errored', () => {
    const prev = [makeGame('bga:1'), makeGame('obg:1', 'obg')]
    const next = [makeGame('obg:1', 'obg')]
    const errors = [{ platform: 'obg' as Platform, error: 'timeout' }]
    const result = computeDeparted(prev, next, errors)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('bga:1')
  })

  it('returns empty when no games departed', () => {
    const games = [makeGame('bga:1'), makeGame('bga:2')]
    expect(computeDeparted(games, games, [])).toHaveLength(0)
  })

  it('returns empty when prev is empty', () => {
    expect(computeDeparted([], [makeGame('bga:1')], [])).toHaveLength(0)
  })

  it('includes all required fields in result', () => {
    const prev = [makeGame('bga:1')]
    const result = computeDeparted(prev, [], [])
    expect(result[0]).toEqual<DepartedGame>({
      id: 'bga:1',
      gameName: 'Game bga:1',
      platform: 'bga',
      gameUrl: 'https://example.com/bga:1',
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest hooks/__tests__/computeDeparted.test.ts --no-coverage
```

Expected: 6 failures with "computeDeparted is not a function" or import error.

- [ ] **Step 4: Run tests to verify they pass**

After Step 1 added the implementation, run again:

```bash
npx jest hooks/__tests__/computeDeparted.test.ts --no-coverage
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/useGamesData.ts hooks/__tests__/computeDeparted.test.ts
git commit -m "feat: add computeDeparted utility with unit tests"
```

---

### Task 2: Wire departure detection into useGamesData

**Files:**
- Modify: `hooks/useGamesData.ts`

**Interfaces:**
- Consumes: `computeDeparted(prev, next, errors): DepartedGame[]` from Task 1
- Produces: `departedGames: DepartedGame[]` added to `UseGamesDataResult`

- [ ] **Step 1: Add departedGames state to the hook**

Open `hooks/useGamesData.ts`. Add state after the existing state declarations (after `freshDataVersion`):

```ts
const [departedGames, setDepartedGames] = useState<DepartedGame[]>([])
```

- [ ] **Step 2: Compute and set departed games in the done handler**

In `runFetch`, locate the `} else if (event.type === 'done') {` block. Before `writeCache(freshData)`, read the current cache and compute departures:

```ts
} else if (event.type === 'done') {
  receivedDone = true
  const freshData: GamesApiResponse = {
    games: allGames,
    errors: allErrors,
    fetchedAt: event.fetchedAt,
    platforms: allPlatforms,
  }
  const prevCache = readCache()
  const prevGames = prevCache?.data.games ?? []
  setDepartedGames(computeDeparted(prevGames, allGames, allErrors))
  const newCachedAt = writeCache(freshData)
  setCachedAt(newCachedAt)
  setDisplayedData(freshData)
  setFreshDataVersion(v => v + 1)
}
```

- [ ] **Step 3: Expose departedGames from the hook**

Update the `UseGamesDataResult` interface:

```ts
export interface UseGamesDataResult {
  displayedData: GamesApiResponse | null
  isRefreshing: boolean
  lastError: string | null
  platformStatuses: Partial<Record<Platform, PlatformStatus>>
  cachedAt: string | null
  freshDataVersion: number
  triggerRefresh: () => void
  departedGames: DepartedGame[]
}
```

Add to the return object:

```ts
return {
  displayedData,
  isRefreshing,
  lastError,
  platformStatuses,
  cachedAt,
  freshDataVersion,
  triggerRefresh,
  departedGames,
}
```

- [ ] **Step 4: Destructure in app/page.tsx**

Open `app/page.tsx`. Add `departedGames` to the destructuring from `useGamesData`:

```tsx
const {
  displayedData,
  isRefreshing,
  lastError,
  platformStatuses,
  freshDataVersion,
  triggerRefresh,
  cachedAt,
  departedGames,
} = useGamesData()
```

Pass to `GameGrid`:

```tsx
<GameGrid
  ...existing props...
  opened={opened}
  onOpen={handleOpen}
  departedGames={departedGames}
/>
```

- [ ] **Step 5: Commit**

```bash
git add hooks/useGamesData.ts app/page.tsx
git commit -m "feat: compute departed games in useGamesData and thread to GameGrid"
```

---

### Task 3: Render the departed notice in GameGrid

**Files:**
- Modify: `components/GameGrid.tsx`

**Interfaces:**
- Consumes: `departedGames: DepartedGame[]` from Task 2, imported from `@/hooks/useGamesData`

- [ ] **Step 1: Add DepartedGame import and departed notice to GameGrid**

Open `components/GameGrid.tsx`. Add the import:

```tsx
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { DepartedGame } from '@/hooks/useGamesData'
```

Add `departedGames` to the Props interface:

```tsx
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
  opened: Set<string>
  onOpen: (id: string) => void
  departedGames: DepartedGame[]
}
```

Destructure in the function signature:

```tsx
export default function GameGrid({ data, prefs, onPrefsChange, dismissed, onDismiss, onRefresh, isRefreshing, lastError, cachedAt, opened, onOpen, departedGames }: Props) {
```

Add local dismiss state inside the component (after the `useAutoRefresh` call):

```tsx
const [departedDismissed, setDepartedDismissed] = useState(false)
```

Add a `useEffect` to reset dismiss when new departures arrive:

```tsx
useEffect(() => {
  if (departedGames.length > 0) setDepartedDismissed(false)
}, [departedGames])
```

Add the notice in the JSX, between the `lastError` warning and the errors list (before `{errors.length > 0 && ...}`):

```tsx
{departedGames.length > 0 && !departedDismissed && (
  <div className="mb-3 flex items-center gap-1.5 text-xs text-[#6b6b6b]">
    <span>↩</span>
    <span>
      {departedGames.length === 1 ? '1 game' : `${departedGames.length} games`} ended since last refresh:{' '}
      {departedGames.map((g, i) => (
        <span key={g.id}>
          {i > 0 && ', '}
          <a
            href={g.gameUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[#1a1a1a]"
          >
            {g.gameName}
          </a>
        </span>
      ))}
    </span>
    <button
      onClick={() => setDepartedDismissed(true)}
      className="ml-1 text-[#9b9b9b] hover:text-[#1a1a1a] leading-none"
      aria-label="Dismiss"
    >
      ×
    </button>
  </div>
)}
```

Also add the `useState` import at the top — `GameGrid` currently only imports from React implicitly via `'use client'`. Add it explicitly:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Game, UserPrefs, GamesApiResponse, PLATFORM_LABELS, PLATFORM_URLS } from '@/lib/types'
```

- [ ] **Step 2: Verify in browser**

Run `npm run dev`. To test departure detection without waiting for a real game to end:

1. Open the dashboard and let it load (populates the cache)
2. Open `hooks/useGamesData.ts`, temporarily add one fake entry to `prevGames` before the `computeDeparted` call: `const prevGames = [...(prevCache?.data.games ?? []), { id: 'fake:99', gameName: 'Test Ended Game', platform: 'bga' as const, gameUrl: 'https://boardgamearena.com' }]`
3. Save → hot-reload fires → notice should appear: "↩ 1 game ended since last refresh: Test Ended Game"
4. Click × → notice hides
5. Click ↻ Refresh → notice reappears (since the fake game is still being injected)
6. Remove the fake entry and save

- [ ] **Step 3: Commit**

```bash
git add components/GameGrid.tsx
git commit -m "feat: show departed games notice after each refresh"
```
