// A hung platform fetch (a connector whose login or page request never
// resolves) must not block the whole /api/games or /api/finished-games
// stream from ever sending its "done" event — that's what made the health
// check's own fetch of /api/games fail with "stream ended without a done
// event" when one of these edge functions got cut off mid-request. This
// doesn't cancel the underlying work, it just stops waiting on it so the
// stream can report that one platform as failed and move on.
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export function formatTimeAgo(date: Date): string {
  const ms = Date.now() - date.getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function formatTimeRemaining(sec: number): string {
  if (sec <= 0) {
    const abs = Math.abs(sec)
    const h = Math.floor(abs / 3600)
    const m = Math.floor((abs % 3600) / 60)
    return h > 0 ? `${h}h ${m}m overtime` : `${m}m overtime`
  }
  const d = Math.floor(sec / 86400)
  if (d >= 2) return `${d}d left`
  const h = Math.floor(sec / 3600)
  if (h >= 1) {
    const m = Math.floor((sec % 3600) / 60)
    return m > 0 ? `${h}h ${m}m left` : `${h}h left`
  }
  const m = Math.floor(sec / 60)
  return `${m}m left`
}

// choochoo.games map keys ("rust-belt", "SwedenRecycling") as a display name
export function choochooGameType(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}
