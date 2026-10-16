'use client'
import { useEffect, useState } from 'react'
import { UserPrefs, DEFAULT_PREFS } from '@/lib/types'

const PREFS_KEY = 'user-prefs'

// Shared by every page that reads/writes prefs (the Active dashboard, the
// History overview) — local state seeded from localStorage for an instant
// first paint, then replaced with the server's copy once it answers.
export function usePrefs() {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)

  useEffect(() => {
    const cachedPrefs = localStorage.getItem(PREFS_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    if (cachedPrefs) setPrefs(JSON.parse(cachedPrefs))
    fetch('/api/prefs').then(r => r.json()).then(p => {
      setPrefs(p)
      localStorage.setItem(PREFS_KEY, JSON.stringify(p))
    }).catch(() => {})
  }, [])

  const updatePrefs = (p: UserPrefs) => {
    setPrefs(p)
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  }

  return { prefs, updatePrefs }
}
