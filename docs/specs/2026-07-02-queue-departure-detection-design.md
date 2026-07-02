# Queue Departure Detection — Design Spec
**Date:** 2026-07-02

## Problem
When games finish or are abandoned, they silently disappear from the active list. The user notices only by comparing game counts between visits — a manual, error-prone workaround.

## Solution
After each successful server fetch, diff the new game list against the previously cached game list (localStorage). Games present in the cache but absent from the new response are "departed." Surface them in a slim, dismissable notice above the game grid.

## Baseline Source
Use the **existing localStorage cache** (`useGamesData` already writes each server response there). On a fresh page open, the cache represents the last known state — so departed games are detected even after hours away from the dashboard.

## Diff Logic (in `useGamesData`)

1. When a fresh server response arrives, read the current localStorage cache before overwriting it.
2. Build a set of departed IDs: IDs in the cached `games` array that are absent from the new `games` array.
3. **False-positive guard:** Only include a departure if the game's platform reported **no error** in the new response. A platform error causes all its games to vanish temporarily; these should not be shown as ended.
4. Store departed games as `{ id, gameName, platform }[]` — enough to render the notice.
5. Expose as `departedGames` from the hook.
6. Clear `departedGames` on the **next** successful fetch (they're one-refresh ephemeral).

## UI — Departed Notice

Rendered in `GameGrid` above the platform badges row, only when `departedGames.length > 0`:

```
↩ 2 games ended since last refresh: Horseless Carriage (OBG), Nucleum (BGA)  [×]
```

- Single line of `text-xs` text in `text-[#6b6b6b]`
- Each game name is a link (`<a>`) opening the game URL — requires storing `gameUrl` in departed entry
- `[×]` button locally dismisses the notice (sets local `showDeparted` state to false); reappears on next refresh if there are new departures
- No modal, no toast — just an inline line that fits the existing aesthetic

## Data Stored Per Departed Game
```ts
{ id: string; gameName: string; platform: Platform; gameUrl: string }
```

## Components Touched

| File | Change |
|------|--------|
| `hooks/useGamesData.ts` | Diff logic; expose `departedGames` |
| `components/GameGrid.tsx` | Render departed notice; local dismiss state |

No backend changes. No type changes in `lib/types.ts`.

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Platform error (games vanish temporarily) | Filtered out by the false-positive guard |
| User opens fresh tab after hours away | Works — diff runs against localStorage cache |
| First ever load (no cache) | Cache is empty → no departures shown |
| Game re-appears (e.g. someone un-finished it) | Not handled — treated as a new game on next refresh |

## Testing
- Have a game in cache; remove it from the mock server response → notice appears with correct name
- Platform error for that game's platform → notice does NOT appear
- Click × → notice hides; next refresh with new departures → notice reappears
- Fresh page load after cache has a game that's no longer active → departure detected correctly
