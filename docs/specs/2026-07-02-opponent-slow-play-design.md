# Opponent Slow-Play Highlighting — Design Spec
**Date:** 2026-07-02

## Problem
The "Waiting for others" section shows games but gives no signal about which opponents have been sitting on their turn for a long time. The user has no way to spot games that may be stalled without manually checking dates.

## Solution
Apply the same urgency treatment already used for overdue "my turn" games to "waiting" games where the opponent's last move was more than N days ago. N is configurable via a new pref (`opponentSlowDays`, default 5).

## Urgency Logic
In `GameCard`, for games where `myTurn === false`:
```
opponentSlow = !game.myTurn && (Date.now() - game.lastMoveAt.getTime()) > opponentSlowDays * 86_400_000
```
When `opponentSlow` is true, apply the same `text-amber-500 font-medium` + `⏱` prefix on the time label that urgent "my turn" games already use.

BGA's `lastMoveAt` is derived from time-limit remaining (already an approximation), so accuracy there is the same as it is for your-turn urgency — no worse.

## Configuration

New pref field: `opponentSlowDays: number` (default `5`).

Added to:
- `lib/types.ts` — `UserPrefs` interface + `DEFAULT_PREFS`
- `app/api/prefs/route.ts` — accepted in PATCH/POST body
- `app/setup/page.tsx` — new number input in the Settings section, same style as the existing BGA sort cap input

## Components Touched

| File | Change |
|------|--------|
| `lib/types.ts` | Add `opponentSlowDays: number` to `UserPrefs`; set default `5` in `DEFAULT_PREFS` |
| `app/api/prefs/route.ts` | Accept + persist `opponentSlowDays` |
| `app/setup/page.tsx` | Add `opponentSlowDays` input (min 1, max 90) with same save pattern as `bgaSortCapDays` |
| `components/GameCard.tsx` | Accept `opponentSlowDays: number` prop; compute + apply `opponentSlow` visual |
| `components/GameGrid.tsx` | Pass `opponentSlowDays` from prefs down to `GameCard` |

## Visual Treatment
Waiting game cards where opponent is slow:
- Time label: `⏱ 6 days ago` in `text-amber-500 font-medium` (identical to overdue your-turn treatment)
- Card background/border unchanged — the amber time label is sufficient signal

## Testing
- Waiting game with `lastMoveAt` 6 days ago + threshold 5 → amber label with ⏱
- Waiting game with `lastMoveAt` 3 days ago + threshold 5 → normal grey label
- Change threshold to 2 in setup → 3-day-old game now shows amber
- My-turn game unaffected by `opponentSlowDays`
