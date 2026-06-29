# Overview Page Design

**Date:** 2026-06-29
**Status:** Approved

## Goal

Add a dedicated `/overview` page that shows recently finished games from all connected services in one unified view. Accessible via a button in the existing dashboard header (next to Settings and Refresh).

## Data Model

New `FinishedGame` type added to `lib/types.ts`:

```typescript
export interface FinishedGame {
  id: string          // e.g. "bga:12345"
  platform: Platform
  gameName: string
  completedAt: Date
  completedAgo: string  // pre-formatted: "3h ago", "2 days ago"
  gameUrl: string
}

export interface FinishedGamesApiResponse {
  games: FinishedGame[]
  errors: { platform: Platform; error: string }[]
  fetchedAt: string
}
```

No `myTurn`, `urgent`, or `players` — those are active-game concepts only.

## Connector Layer

Each connector file that can expose finished games gets a new exported function: `fetchFinishedBGA`, `fetchFinishedEighteenXX`, etc. These are added only where the platform API supports game history.

Known support at design time:
- **18xx.games** — certain: `/api/game/user` returns all games; filter `g.status !== 'active'`
- **BGA** — likely: tablemanager has `status=play`; investigate `status=done` or equivalent
- **OBG, Yucata, Hansa, Choochoo, Rally** — unknown; investigate per connector; skip gracefully if unsupported

A new `makeFinishedConnectors()` function in `lib/connectors/index.ts` registers only platforms that have a `fetchFinished*` implementation. Reuses `hasCreds` as-is.

## API Route

New `/api/finished-games` route:
- Edge runtime (`export const runtime = 'edge'`)
- Same SSE streaming pattern as `/api/games`: `data: {...}\n\n` events
- Same event shape: `start`, `platform` (with `games` and `error`), `done`
- Calls `makeFinishedConnectors()` and fans out in parallel with `Promise.allSettled`

## UI

### Navigation

"Overview" button added to `GameGrid` header, left of the existing Settings button:

```
⊞ Overview   ⚙ Settings   ↻ Refresh
```

Implemented as `<a href="/overview">` — a plain link, not a client-side nav, consistent with the Settings link pattern.

### Page: `app/overview/page.tsx`

- `'use client'` page
- Same dark background and typography as the main dashboard
- Same header row (title + Overview/Settings/Refresh buttons; Overview button is highlighted/active)
- Fetches from `/api/finished-games` via SSE on mount using the same hook pattern as `useGamesData`
- Games sorted newest-first by `completedAt`

**Platform filter:** Chips using existing `BADGE_COLORS` — "All" selected by default. Clicking a chip filters the list to that platform only. Chips show only platforms that returned at least one game.

**Game list:** Flat list of `FinishedGameCard` components (not a grid — finished games are more of a log than an action list).

**Pagination:** "Load more" button at the bottom. Default page size: 20 games. Each click reveals the next 20.

**Loading state:** Reuses `FetchProgress` with the SSE data while fetching.

**Errors:** Same `⚠ platform unavailable` chip style as the main dashboard.

**No PlaySidebar** — not relevant for finished games.

### Component: `FinishedGameCard`

Slim card, no interactive actions:

```
[BGA]  Brass: Birmingham          View →
       Completed 3 days ago
```

- Platform badge (`BADGE_COLORS`)
- Game name
- `completedAgo` text
- "View →" link to `gameUrl` (opens in new tab for all platforms)

## Out of Scope

- Win/loss result or final score (not requested; platforms vary in what they expose)
- Who you played with (not requested)
- Filtering by date range (not requested)
- Infinite scroll (load-more button preferred)
