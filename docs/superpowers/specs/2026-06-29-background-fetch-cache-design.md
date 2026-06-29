# Background Fetch & Cache Design

**Date:** 2026-06-29  
**Status:** Approved

## Problem

Every page load triggers a full blocking fetch across all platforms. BGA login alone takes 3–5 seconds. The UI is blocked behind a full-page spinner until every platform responds.

## Goal

Show data instantly on revisit, fetch fresh data in the background, and let the user apply updates when ready — without ever blocking the UI.

## Architecture Overview

Three new pieces, two modified. The API route (`/api/games`) is unchanged.

**New:**
- `hooks/useGamesData.ts` — all fetch, cache, and state logic
- `components/FetchProgress.tsx` — compact per-platform progress strip
- `components/PendingUpdateBanner.tsx` — "fresh data ready" banner

**Modified:**
- `app/page.tsx` — slimmed down to compose from the hook
- `components/GameGrid.tsx` — refresh link becomes a real button with loading state

## `useGamesData` Hook

### Interface

```ts
{
  displayedData: GamesApiResponse | null   // what GameGrid renders
  pendingData: GamesApiResponse | null     // fresh fetch, waiting to be applied
  isRefreshing: boolean                    // SSE fetch in progress
  lastError: string | null                 // last fetch failure message
  platformStatuses: Partial<Record<Platform, PlatformStatus>>
  hasCache: boolean                        // whether displayedData came from cache
  triggerRefresh: () => void
  applyPendingData: () => void
}
```

### State Machine

**On mount:**
1. Read `localStorage['games-cache']` — if present, set `displayedData` and `hasCache = true`
2. Start SSE fetch → `isRefreshing = true`; update `platformStatuses` as `platform` events arrive
3. On `done` event → write response to localStorage, set `pendingData`, `isRefreshing = false`
4. On error → set `lastError`, `isRefreshing = false`; `displayedData` unchanged

**`triggerRefresh`:** same SSE fetch; `displayedData` stays visible throughout.

**`applyPendingData`:** moves `pendingData → displayedData`, clears `pendingData` and `lastError`.

### Cache Shape

```ts
interface GamesCache {
  data: GamesApiResponse   // games[].lastMoveAt serialised as ISO string
  cachedAt: string         // ISO timestamp of when the cache was written
}
```

`Game.lastMoveAt` is re-hydrated to `Date` on read, matching existing SSE deserialisation.

localStorage reads/writes are wrapped in try/catch; on any failure the hook silently falls back to no-cache behaviour.

## Components

### `FetchProgress`

Props: `platformStatuses`, `expectedPlatforms`

A compact horizontal strip showing per-platform status with the same icons as today (`⟳` / `✓` / `✗`). Not full-screen.

- **First load (no cache):** replaces the grid area; shown centred in the left panel
- **With cache:** shown as a thin bar at the top of the grid column during background fetch

### `PendingUpdateBanner`

Props: `pendingData`, `displayedData`, `onApply`

Appears above the grid when `pendingData` is set:

```
↻ Fresh data ready (fetched at 14:32) — Apply
```

Disappears when the user clicks Apply (which calls `applyPendingData`).

### `GameGrid` Changes

New props: `onRefresh: () => void`, `isRefreshing: boolean`, `lastError: string | null`

- Replace `<a href="/">↻ Refresh</a>` with `<button onClick={onRefresh}>↻ Refresh</button>`
- When `isRefreshing`: button shows spinner, is disabled
- When `lastError`: show inline note next to button: `"Last refresh failed — showing cache from X ago"` (X derived from `cachedAt`)

### `page.tsx` Layout

```
flex h-screen overflow-hidden
├── left panel (flex-1 flex-col overflow-hidden)
│   ├── FetchProgress — rendered by page.tsx, not inside GameGrid
│   │     • no cache: shown centred, replaces grid
│   │     • has cache + isRefreshing: shown as slim bar above grid
│   ├── PendingUpdateBanner (when pendingData exists)   ← above grid
│   └── GameGrid (when displayedData exists)
└── PlaySidebar (receives empty array during first load)
```

## Error Handling & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Fetch fails, no cache | `FetchProgress` shows `✗` marks; error note on refresh button; user retries manually |
| Fetch fails, stale cache | Grid stays as-is; `lastError` shows on button with staleness from `cachedAt` |
| Background fetch completes with same data | `pendingData` set, banner appears; user may ignore or apply |
| User applies pending data mid-scroll | Grid re-renders with fresh data; reordering is expected as user explicitly triggered it |
| `start` event with 0 platforms | Redirect to `/setup` (same as today) |
| `localStorage` unavailable | try/catch; falls back to no-cache fetch behaviour silently |

## Manual Verification Checklist

- [ ] First load (localStorage cleared): compact progress strip visible, grid populates, cache written
- [ ] Revisit (cache present): grid renders immediately, background fetch runs silently, pending banner appears
- [ ] Manual refresh: button spins, banner appears on completion, Apply swaps data
- [ ] Network failure: error note on refresh button with staleness timestamp
- [ ] localStorage unavailable: no crash, normal fetch flow
