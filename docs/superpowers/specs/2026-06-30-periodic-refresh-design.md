# Periodic Refresh — Design Spec

**Date:** 2026-06-30  
**Scope:** Active tab only (`/`)

---

## Overview

Add a per-tab, non-persistent periodic auto-refresh option to the Active tab. A `<select>` next to the existing refresh button lets the user choose an interval (Off / 30s / 1m / 5m). A countdown badge shows time until next refresh. State lives only in React — no localStorage — so it resets when the tab is opened.

---

## Architecture

### New file: `hooks/useAutoRefresh.ts`

A focused hook that owns all timer logic. `GameGrid` calls it and wires the returned values to the UI.

**Signature:**
```ts
function useAutoRefresh(
  onRefresh: () => void,
  isRefreshing: boolean,
): {
  intervalSeconds: number       // 0 = Off
  setIntervalSeconds: (s: number) => void
  countdown: number             // seconds remaining; 0 when Off
}
```

**Behavior:**
- `intervalSeconds` starts at `0` (Off).
- A `useEffect` keyed on `intervalSeconds` starts a 1-second `setInterval` tick. It clears on cleanup (interval change or unmount).
- Each tick decrements `countdown` by 1.
- When `isRefreshing` is `true`, ticking is paused (tick is a no-op) so a slow fetch doesn't cause back-to-back refreshes.
- When `countdown` reaches `0` and `isRefreshing` is `false`, `onRefresh()` is called and `countdown` resets to `intervalSeconds`.
- When the user changes the interval, `countdown` resets to the new value immediately.
- When the user triggers a manual refresh, `countdown` resets to `intervalSeconds` when the next effect runs (i.e., it starts fresh after the fetch completes, not mid-flight).

### Modified file: `components/GameGrid.tsx`

- Import and call `useAutoRefresh(onRefresh, isRefreshing)`.
- Add the `<select>` and countdown badge to `navRight`.
- No changes to props interface.

---

## UI

`navRight` layout (left → right):

```
[game count · your turn]   [↻ Refresh]   [23s]   [Off ▾]
```

- `[↻ Refresh]` — existing button, unchanged.
- `[23s]` — countdown text, `text-xs text-[#9b9b9b]`, hidden when Off or on mobile (`hidden sm:inline`).
- `[Off ▾]` — `<select>` styled to match the refresh button (same height, border, background, text-xs). Options:

  | value | label |
  |-------|-------|
  | 0     | Off   |
  | 30    | 30s   |
  | 60    | 1m    |
  | 300   | 5m    |

The select is never disabled — the user can change the interval even while a fetch is in progress.

---

## Error handling

No special handling needed. If `onRefresh` is called while a fetch is already in progress, `useGamesData` guards against concurrent fetches via `fetchingRef.current`. The pause-when-`isRefreshing` behavior prevents the countdown from firing again before the previous fetch completes.

---

## Not in scope

- Persistent interval preference (localStorage / server prefs).
- Auto-refresh on the History (`/overview`) tab.
- Visual progress ring around the countdown.
- Pause on tab visibility change (`visibilitychange` API).
