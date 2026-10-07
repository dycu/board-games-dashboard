'use client'
import { useCallback, useEffect, useState } from 'react'
import { Platform } from '@/lib/types'
import { BacklogItem, backlogId } from '@/lib/backlog/list'

export interface AddRequest {
  platform: Platform
  gameName: string
  playUrl?: string
  gameUrl?: string
}

async function fetchBacklog(): Promise<BacklogItem[]> {
  const res = await fetch('/api/backlog')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `Server error ${res.status}`)
  return json.items
}

// Changes show at once; the server's list replaces them when the save returns
export function useBacklog() {
  const [items, setItems] = useState<BacklogItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<Set<string>>(new Set())

  const load = useCallback(() => fetchBacklog()
    .then(list => { setItems(list); setError(null) })
    .catch(e => setError(e instanceof Error ? e.message : 'Failed to load the backlog')), [])

  useEffect(() => {
    let cancelled = false
    fetchBacklog()
      .then(list => { if (!cancelled) setItems(list) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load the backlog') })
    return () => { cancelled = true }
  }, [])

  const send = useCallback(async (body: object) => {
    try {
      const res = await fetch('/api/backlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Server error ${res.status}`)
      setItems(json.items)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving failed')
      load() // show what is actually saved
    }
  }, [load])

  const has = useCallback(
    (platform: Platform, gameName: string) => !!items?.some(i => i.id === backlogId(platform, gameName)),
    [items],
  )

  const add = useCallback(async (req: AddRequest) => {
    const id = backlogId(req.platform, req.gameName)
    setAdding(prev => new Set(prev).add(id))
    await send({ op: 'add', ...req })
    setAdding(prev => { const next = new Set(prev); next.delete(id); return next })
  }, [send])

  const isAdding = useCallback(
    (platform: Platform, gameName: string) => adding.has(backlogId(platform, gameName)),
    [adding],
  )

  const remove = useCallback((id: string) => {
    setItems(prev => prev?.filter(i => i.id !== id) ?? prev)
    send({ op: 'remove', id })
  }, [send])

  const reorder = useCallback((ordered: BacklogItem[]) => {
    setItems(ordered)
    send({ op: 'order', ids: ordered.map(i => i.id) })
  }, [send])

  return { items, error, has, add, isAdding, remove, reorder }
}
