'use client'
import { useEffect } from 'react'
import { applyTheme } from '@/lib/theme'

// Mounted once in the root layout, so every route gets it — not just the
// ones that happen to call usePrefs() (the Active dashboard, History,
// Settings). app/layout.tsx's inline script only ever reads theme from
// localStorage's cached copy, once, before hydration; without this, a page
// that doesn't call usePrefs() had nothing to correct data-theme once the
// real, authoritative prefs came back from the server — so a stale or
// missing local cache (right after clearing site data, a storage eviction,
// or simply the very first visit) left that page stuck on whatever
// prefers-color-scheme happened to render initially, for the whole visit.
export default function ThemeSync() {
  useEffect(() => {
    fetch('/api/prefs').then(r => r.json()).then(p => applyTheme(p.theme)).catch(() => {})
  }, [])
  return null
}
