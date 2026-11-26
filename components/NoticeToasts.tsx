'use client'
import { useEffect, useRef, useState } from 'react'
import { Notice, subscribeNotices, dismissNotice } from '@/lib/notify'

// Info notices fade on their own — they're just "FYI, something happened"
// (e.g. your turn came back around). Errors stay until dismissed: they mean
// something didn't actually save, and that's worth not losing track of.
const INFO_AUTO_DISMISS_MS = 8_000

export default function NoticeToasts() {
  const [notices, setNotices] = useState<Notice[]>([])
  useEffect(() => subscribeNotices(setNotices), [])

  // Keyed per-notice, not a single effect re-armed on every array change —
  // otherwise a brand new notice arriving would restart the countdown on
  // every info notice already waiting, not just add its own.
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const timers = timersRef.current
    for (const n of notices) {
      if (n.kind === 'info' && !timers.has(n.id)) {
        timers.set(n.id, setTimeout(() => { dismissNotice(n.id); timers.delete(n.id) }, INFO_AUTO_DISMISS_MS))
      }
    }
    for (const id of [...timers.keys()]) {
      if (!notices.some(n => n.id === id)) {
        clearTimeout(timers.get(id))
        timers.delete(id)
      }
    }
  }, [notices])
  useEffect(() => () => { timersRef.current.forEach(clearTimeout) }, [])

  return (
    <>
      {notices.map(n => (
        <div
          key={n.id}
          role={n.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2 max-w-[min(calc(100vw-4.5rem),20rem)] text-xs rounded-xl px-3 py-1.5 shadow-sm border ${
            n.kind === 'error'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-[var(--accent-tint)] text-[var(--text-primary)] border-[var(--accent-border-hover)]'
          }`}
        >
          <span className="flex-1">
            {n.message}
            {n.links && n.links.length > 0 && (
              <>
                {' '}
                {n.links.map((link, i) => (
                  <span key={link.url}>
                    {i > 0 && ', '}
                    <a
                      href={link.url}
                      target={link.external === false ? '_self' : '_blank'}
                      rel="noopener noreferrer"
                      className="underline hover:no-underline"
                    >
                      {link.label}
                    </a>
                  </span>
                ))}
              </>
            )}
          </span>
          <button
            onClick={() => dismissNotice(n.id)}
            aria-label="Dismiss notification"
            className="shrink-0 text-current opacity-70 hover:opacity-100 text-xs leading-none"
          >
            ✕
          </button>
        </div>
      ))}
    </>
  )
}
