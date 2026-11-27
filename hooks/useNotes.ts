'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { reportNotice } from '@/lib/notify'

function sameNotes(a: Record<string, string>, b: Record<string, string>) {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(k => a[k] === b[k])
}

// Notes show at once; the server's copy replaces them when the save returns.
// They're also re-read whenever the dashboard tab comes back into view, since
// a note can change elsewhere while it sits open — most often from the
// note banner on a game page (bga-userscripts/game-notes-banner.user.js).
export function useNotes() {
  const [notes, setNotes] = useState<Record<string, string>>({})
  // Saves in flight: a re-read answered meanwhile may predate the save and
  // would briefly undo the note just typed, so it's dropped — the save's own
  // response brings the server's copy anyway.
  const savingRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      if (savingRef.current > 0) return
      fetch('/api/notes').then(r => r.json()).then(json => {
        if (cancelled || !json.notes || savingRef.current > 0) return
        setNotes(prev => (sameNotes(prev, json.notes) ? prev : json.notes))
      }).catch(() => {})
    }
    load()
    // visibilitychange covers switching back to the tab; focus covers
    // coming back to a window whose tab never stopped being visible
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  const saveNote = useCallback(async (id: string, text: string) => {
    setNotes(prev => {
      const next = { ...prev }
      if (text.trim()) next[id] = text.trim()
      else delete next[id]
      return next
    })
    savingRef.current++
    try {
      const res = await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text }),
      })
      const json = await res.json()
      if (res.ok && json.notes) setNotes(json.notes)
      // keeps the optimistic note either way; the next load shows what was
      // actually saved, but it would otherwise look saved for good until
      // then, with no sign anything went wrong
      else reportNotice('error', "Your note didn't save — try again")
    } catch {
      reportNotice('error', "Your note didn't save — try again")
    } finally {
      savingRef.current--
    }
  }, [])

  return { notes, saveNote }
}
