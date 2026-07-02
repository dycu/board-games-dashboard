# Opened-This-Session Tracking — Design Spec
**Date:** 2026-07-02

## Problem
When working through 10+ "my turn" games in a session, it's easy to lose track of which games you've already clicked into and played vs. which ones still need your turn.

## Solution
Track which games the user has opened (clicked "Open →") within the current browser session using `sessionStorage`. Mark opened cards visually so they're distinguishable from unvisited ones. Don't dismiss them — keep them in the list so the user can revisit if needed.

## Data

- **Storage:** `sessionStorage` key `opened-games`, value: JSON array of game ID strings.
- **Lifecycle:** Cleared automatically when the browser tab closes (sessionStorage semantics). Also cleared when fresh server data arrives (same trigger that clears dismissed state), so a completed refresh resets the session context.
- **State management:** `app/page.tsx` owns an `opened: Set<string>` state, initialised from sessionStorage on mount. An `handleOpen(id)` callback adds the ID to the set and writes back to sessionStorage.

## Visual Treatment

In `GameCard`, when `opened` is true for the game:
- Card opacity drops to `opacity-60`
- "Open →" button label becomes "↗ Open" to signal it's been visited
- All interactions remain enabled (still clickable, still dismissable, still pinnable)

No other visual changes — the card stays in its position in the list.

## Components Touched

| File | Change |
|------|--------|
| `app/page.tsx` | Add `opened` state + `handleOpen` callback; pass to `GameGrid` |
| `components/GameGrid.tsx` | Accept and thread `opened` set + `onOpen` callback down to `GameCard` |
| `components/GameCard.tsx` | Accept `opened: boolean` + `onOpen: () => void` props; fire `onOpen` on "Open →" click; apply visual treatment |

## Error Handling
None needed — sessionStorage failures (e.g. private browsing quota) are silently ignored; the feature degrades to no visual marking.

## Testing
- Click "Open →" on a game → card dims and button label changes
- Dismiss the page, reopen → opened state is gone (sessionStorage cleared)
- Trigger a refresh that fetches fresh server data → opened state clears
- Pinned + opened game → still shows pin star correctly
