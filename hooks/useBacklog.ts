'use client'
import { useCallback, useEffect, useState } from 'react'
import { Platform } from '@/lib/types'
import { BacklogItem, BacklogList, backlogId, listsOf, toggleList, reorderItems } from '@/lib/backlog/list'

export interface AddRequest {
  platform: Platform
  gameName: string
  playUrl?: string
  gameUrl?: string
  list: BacklogList
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

  // The lists the game is in, if any — a game can be in more than one at once
  const listsFor = useCallback(
    (platform: Platform, gameName: string): BacklogList[] => {
      const item = items?.find(i => i.id === backlogId(platform, gameName))
      return item ? listsOf(item) : []
    },
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

  // `ordered` is one list in its new order; the other list keeps its order
  const reorder = useCallback((ordered: BacklogItem[]) => {
    const ids = ordered.map(i => i.id)
    setItems(prev => prev && reorderItems(prev, ids))
    send({ op: 'order', ids })
  }, [send])

  // Adds or removes membership in one list, leaving any others the item is
  // already in untouched
  const toggle = useCallback((id: string, list: BacklogList) => {
    setItems(prev => prev && toggleList(prev, id, list))
    send({ op: 'toggle', id, list })
  }, [send])

  return { items, error, listsFor, add, isAdding, remove, reorder, toggle }
}
