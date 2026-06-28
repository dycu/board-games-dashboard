# Platform Quick-Links Bar

**Date:** 2026-06-28
**Status:** Approved

## Problem

The dashboard shows active games but provides no way to jump directly to a platform's lobby without having a game pending. Users sometimes want to browse open games, check new tables, or plan ahead — none of which require an active turn.

## Solution

Add a horizontal row of colored pill-shaped anchor links inside `GameGrid`, placed between the header/errors block and the `FilterToolbar`. Each pill links to the platform's root URL and opens in a new tab. The bar is always visible as long as any platform is configured.

## Design

### Component location

The bar renders inside `GameGrid` (components/GameGrid.tsx), just above `<FilterToolbar>`. No new component file is needed — it is a small inline `<div>` of `<a>` tags.

### Which platforms appear

Derived from `data.games` and `data.errors`: the union of unique platforms present in either list. This matches exactly the set of configured, non-disabled platforms without adding any new data to the API response.

### Styling

Each pill uses the same color classes as the badge on `GameCard`. To avoid duplication, `BADGE_COLORS` moves from `GameCard.tsx` to a new `lib/platform-colors.ts` file. Both `GameCard` and the new bar import from there.

Pill appearance mirrors the existing badge style: `text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full` plus the per-platform color pair.

### Link target

Each pill links to `PLATFORM_URLS[platform]` (already defined in `lib/types.ts`) and opens with `target="_blank" rel="noopener noreferrer"`.

## Files changed

| File | Change |
|------|--------|
| `lib/platform-colors.ts` | New — exports `BADGE_COLORS` record |
| `components/GameCard.tsx` | Import `BADGE_COLORS` from `lib/platform-colors.ts` instead of inlining |
| `components/GameGrid.tsx` | Add platform quick-links bar; import `BADGE_COLORS` and `PLATFORM_URLS` |

## Out of scope

- Sidebar / Play Session panel changes (separate decision)
- Fetching open/lobby games from platforms (only links to platform homepages)
- Any new API calls or state
