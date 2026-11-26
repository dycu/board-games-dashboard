'use client'

// A tiny module-level pub-sub, not React context: the things that need to
// raise a notice (useNotes, useBacklog's callers, app/page.tsx) live in
// completely different parts of the tree from the one place that renders
// them (NoticeToasts, inside the notification tray), with no shared
// ancestor worth threading a provider through just for this.
export interface Notice {
  id: string
  kind: 'error' | 'info'
  message: string
}

let notices: Notice[] = []
const listeners = new Set<(notices: Notice[]) => void>()
let counter = 0

function emit() {
  listeners.forEach(listener => listener(notices))
}

export function reportNotice(kind: Notice['kind'], message: string): string {
  const id = `${Date.now()}-${++counter}`
  notices = [...notices, { id, kind, message }]
  emit()
  return id
}

export function dismissNotice(id: string): void {
  notices = notices.filter(n => n.id !== id)
  emit()
}

export function subscribeNotices(listener: (notices: Notice[]) => void): () => void {
  listeners.add(listener)
  listener(notices)
  return () => listeners.delete(listener)
}
