import { UserPrefs } from './types'

// The one place that applies a theme choice to the DOM — used wherever
// prefs.theme becomes known or changes (the initial cache load, the server
// round trip landing later with a different value, or the user actively
// picking one in Settings), so data-theme never drifts out of sync with
// whatever the current prefs actually say. Before this was consolidated,
// only app/layout.tsx's anti-flash inline script (reading localStorage's
// cached copy, once, before hydration) and Settings' own save handler ever
// touched the attribute — so a fetch('/api/prefs') landing after that first
// paint with a *different* theme (a stale or missing local cache, common
// right after clearing site data or a storage eviction) left the page
// stuck on whatever prefers-color-scheme happened to render initially,
// with nothing to correct it for the rest of that visit.
export function applyTheme(theme: UserPrefs['theme']): void {
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme)
  else document.documentElement.removeAttribute('data-theme')
}
