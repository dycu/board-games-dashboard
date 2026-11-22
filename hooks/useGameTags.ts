'use client'
import { useCallback, useEffect, useState } from 'react'
import { Platform } from '@/lib/types'
import { GameTagsByPlatform } from '@/lib/gameTags/match'

async function fetchGameTags(): Promise<GameTagsByPlatform> {
  const res = await fetch('/api/game-tags')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `Server error ${res.status}`)
  return json.byPlatform
}

// Shared by the History game page (the only place tags are added/removed —
// see its own comment) and anywhere else that just needs to read them (a
// filter, a badge on a card) — one fetch, cached in this hook's state
// rather than every caller re-fetching.
export function useGameTags() {
  const [byPlatform, setByPlatform] = useState<GameTagsByPlatform | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => fetchGameTags()
    .then(data => { setByPlatform(data); setError(null) })
    .catch(e => setError(e instanceof Error ? e.message : 'Failed to load game tags')), [])

  useEffect(() => { load() }, [load])

  // Changes show at once; the server's copy replaces it when the save returns
  const saveTags = async (platform: Platform, gameName: string, tags: string[]) => {
    setByPlatform(prev => {
      const platformEntries = prev?.[platform] ?? {}
      return { ...prev, [platform]: { ...platformEntries, [gameName.toLowerCase()]: { tags, gameName } } }
    })
    await fetch('/api/game-tags', {
      method: 'POST',
      body: JSON.stringify({ platform, gameName, tags }),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return { byPlatform, error, saveTags, reload: load }
}
