'use client'
import { useCallback, useEffect, useState } from 'react'
import { Platform } from '@/lib/types'
import { OpponentEntry } from '@/lib/opponents/store'

type ByPlatform = Partial<Record<Platform, Record<string, OpponentEntry>>>

async function fetchOpponents(): Promise<ByPlatform> {
  const res = await fetch('/api/opponents')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `Server error ${res.status}`)
  return json.byPlatform
}

// Shared by the Players page (the list + tag editor) and anywhere else that
// just needs to read tags (e.g. a hint near a "Play" link) — one fetch,
// cached in this hook's state rather than every caller re-fetching.
export function useOpponents() {
  const [byPlatform, setByPlatform] = useState<ByPlatform | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => fetchOpponents()
    .then(data => { setByPlatform(data); setError(null) })
    .catch(e => setError(e instanceof Error ? e.message : 'Failed to load opponents')), [])

  useEffect(() => { load() }, [load])

  // Changes show at once; the server's copy replaces it when the save returns
  const saveTags = async (platform: Platform, name: string, tags: string[]) => {
    setByPlatform(prev => {
      const platformEntries = prev?.[platform] ?? {}
      const existing = platformEntries[name] ?? { tags: [], responseSamples: [] }
      return { ...prev, [platform]: { ...platformEntries, [name]: { ...existing, tags } } }
    })
    await fetch('/api/opponents', {
      method: 'POST',
      body: JSON.stringify({ platform, name, tags }),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return { byPlatform, error, saveTags, reload: load }
}
