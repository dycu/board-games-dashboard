# Platform Quick-Links Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a row of colored pill-links to each configured platform's homepage, always visible in the main dashboard above the filter toolbar.

**Architecture:** Extract the shared `BADGE_COLORS` map from `GameCard.tsx` into `lib/platform-colors.ts`, then render a quick-links bar inside `GameGrid.tsx` using those colors and the existing `PLATFORM_URLS` and `PLATFORM_LABELS` from `lib/types.ts`. No new API calls or state.

**Tech Stack:** Next.js (App Router), React, Tailwind CSS, Jest + React Testing Library

## Global Constraints

- Tailwind only — no inline styles or CSS modules
- All new anchor tags must have `target="_blank" rel="noopener noreferrer"`
- Use `@/` path alias for all imports (configured in `jest.config.ts` and `tsconfig`)
- Run tests with: `npx jest --no-coverage`

---

### Task 1: Extract BADGE_COLORS to shared module and update GameCard

**Files:**
- Create: `lib/platform-colors.ts`
- Modify: `components/GameCard.tsx` (remove inline map, add import)

**Interfaces:**
- Produces: `BADGE_COLORS: Record<string, string>` exported from `lib/platform-colors.ts`

- [ ] **Step 1: Create `lib/platform-colors.ts`**

```ts
export const BADGE_COLORS: Record<string, string> = {
  bga: 'bg-blue-950 text-blue-400',
  eighteenxx: 'bg-red-950 text-red-400',
  obg: 'bg-yellow-950 text-yellow-400',
  yucata: 'bg-green-950 text-green-400',
  choochoo: 'bg-orange-950 text-orange-400',
  hansa: 'bg-purple-950 text-purple-400',
  rally: 'bg-sky-950 text-sky-400',
}
```

- [ ] **Step 2: Update `components/GameCard.tsx`**

Remove the inline `BADGE_COLORS` block (lines 4–12 of the current file) and replace the opening of the file with:

```tsx
'use client'
import { Game, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
```

The rest of the file is unchanged.

- [ ] **Step 3: Run existing GameCard tests to confirm no regression**

```bash
npx jest --no-coverage GameCard.test
```

Expected output: all 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/platform-colors.ts components/GameCard.tsx
git commit -m "refactor: extract BADGE_COLORS to lib/platform-colors"
```

---

### Task 2: Add platform quick-links bar to GameGrid

**Files:**
- Create: `__tests__/components/GameGrid.test.tsx`
- Modify: `components/GameGrid.tsx`

**Interfaces:**
- Consumes: `BADGE_COLORS` from `lib/platform-colors.ts` (Task 1), `PLATFORM_URLS` and `PLATFORM_LABELS` from `lib/types.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/GameGrid.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import GameGrid from '@/components/GameGrid'
import { GamesApiResponse, DEFAULT_PREFS, PLATFORM_URLS, Game } from '@/lib/types'

function makeGame(platform: Game['platform'], id: string): Game {
  return {
    id: `${platform}:${id}`,
    platform,
    gameName: 'Test Game',
    myTurn: true,
    lastMoveAt: new Date(),
    lastMoveAgo: '1h ago',
    urgent: false,
    gameUrl: `https://example.com/game/${id}`,
    platformUrl: PLATFORM_URLS[platform],
    players: [],
  }
}

describe('GameGrid quick-links bar', () => {
  it('renders a link for each platform present in games', () => {
    const data: GamesApiResponse = {
      games: [makeGame('bga', '1'), makeGame('yucata', '2')],
      errors: [],
      fetchedAt: new Date().toISOString(),
    }
    render(
      <GameGrid
        data={data}
        prefs={DEFAULT_PREFS}
        onPrefsChange={() => {}}
        dismissed={new Set()}
        onDismiss={() => {}}
      />
    )
    const bgaLink = screen.getByRole('link', { name: 'BGA' })
    expect(bgaLink).toHaveAttribute('href', PLATFORM_URLS.bga)
    const yucataLink = screen.getByRole('link', { name: 'Yucata' })
    expect(yucataLink).toHaveAttribute('href', PLATFORM_URLS.yucata)
  })

  it('includes platforms that errored (no games returned)', () => {
    const data: GamesApiResponse = {
      games: [makeGame('bga', '1')],
      errors: [{ platform: 'rally', error: 'timeout' }],
      fetchedAt: new Date().toISOString(),
    }
    render(
      <GameGrid
        data={data}
        prefs={DEFAULT_PREFS}
        onPrefsChange={() => {}}
        dismissed={new Set()}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByRole('link', { name: 'Rally the Troops' })).toHaveAttribute(
      'href',
      PLATFORM_URLS.rally,
    )
  })

  it('does not duplicate a platform that has both games and an error entry', () => {
    const data: GamesApiResponse = {
      games: [makeGame('bga', '1'), makeGame('bga', '2')],
      errors: [{ platform: 'bga', error: 'partial' }],
      fetchedAt: new Date().toISOString(),
    }
    render(
      <GameGrid
        data={data}
        prefs={DEFAULT_PREFS}
        onPrefsChange={() => {}}
        dismissed={new Set()}
        onDismiss={() => {}}
      />
    )
    expect(screen.getAllByRole('link', { name: 'BGA' })).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest --no-coverage GameGrid.test
```

Expected: FAIL — "Unable to find an accessible element with the role 'link' and name 'BGA'"

- [ ] **Step 3: Update `components/GameGrid.tsx`**

Add two imports at the top (after existing imports):

```tsx
import { BADGE_COLORS } from '@/lib/platform-colors'
```

`PLATFORM_URLS` and `PLATFORM_LABELS` are already imported from `@/lib/types` — add `PLATFORM_URLS` to that import if not already present:

```tsx
import { Game, UserPrefs, GamesApiResponse, PLATFORM_LABELS, PLATFORM_URLS } from '@/lib/types'
```

Inside the `GameGrid` component body, after the `const { games, errors, fetchedAt } = data` destructure line, add:

```tsx
const configuredPlatforms = Array.from(
  new Set([...games.map(g => g.platform), ...errors.map(e => e.platform)])
)
```

Then, inside the JSX, add the quick-links bar between the errors block and the `<FilterToolbar>` line:

```tsx
{configuredPlatforms.length > 0 && (
  <div className="flex flex-wrap gap-2 mb-4">
    {configuredPlatforms.map(p => (
      <a
        key={p}
        href={PLATFORM_URLS[p]}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[p] ?? 'bg-slate-800 text-slate-400'}`}
      >
        {PLATFORM_LABELS[p]}
      </a>
    ))}
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest --no-coverage GameGrid.test
```

Expected: all 3 tests pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add __tests__/components/GameGrid.test.tsx components/GameGrid.tsx
git commit -m "feat: add platform quick-links bar to dashboard"
```
