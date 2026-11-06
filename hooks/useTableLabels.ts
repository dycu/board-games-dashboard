'use client'
import { useCallback, useEffect, useState } from 'react'

// Labels show at once; the server's copy replaces them when the save returns
export function useTableLabels() {
  const [labels, setLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/table-labels').then(r => r.json()).then(json => {
      if (!cancelled && json.labels) setLabels(json.labels)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const saveLabel = useCallback(async (id: string, text: string) => {
    setLabels(prev => {
      const next = { ...prev }
      if (text.trim()) next[id] = text.trim()
      else delete next[id]
      return next
    })
    try {
      const res = await fetch('/api/table-labels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text }),
      })
      const json = await res.json()
      if (res.ok && json.labels) setLabels(json.labels)
    } catch {
      // keeps the optimistic label; the next load shows what was saved
    }
  }, [])

  return { labels, saveLabel }
}
