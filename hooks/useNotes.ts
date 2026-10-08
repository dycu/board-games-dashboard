'use client'
import { useCallback, useEffect, useState } from 'react'

// Notes show at once; the server's copy replaces them when the save returns
export function useNotes() {
  const [notes, setNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/notes').then(r => r.json()).then(json => {
      if (!cancelled && json.notes) setNotes(json.notes)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const saveNote = useCallback(async (id: string, text: string) => {
    setNotes(prev => {
      const next = { ...prev }
      if (text.trim()) next[id] = text.trim()
      else delete next[id]
      return next
    })
    try {
      const res = await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text }),
      })
      const json = await res.json()
      if (res.ok && json.notes) setNotes(json.notes)
    } catch {
      // keeps the optimistic note; the next load shows what was saved
    }
  }, [])

  return { notes, saveNote }
}
