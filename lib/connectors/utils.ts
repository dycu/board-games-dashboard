// A hung platform fetch (a connector whose login or page request never
// resolves) must not block the whole /api/games or /api/finished-games
// stream from ever sending its "done" event — that's what made the cron
// emails' own fetch of /api/games fail with "stream ended without a done
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

// Game.currentPlayer text for a lobby that hasn't started yet (see
// Game.pending). "waiting to start" on its own reads as imminent — fine
// once every seat is actually filled, but misleading while it's still
// short (an earlier version of this text said "waiting to start" even at
// "1 joined", which is pretty clearly not about to start). Collapsing to
// that one phrase regardless of fullness is what this fixes: with the
// total seat count known, it distinguishes still-short from full-and-
// ready; without it (most platforms don't expose a seat total for a
// lobby), it never claims "ready to start" it can't actually confirm.
export function pendingLobbyText(joined: number, needed?: number): string {
  if (needed == null) return `${joined} joined — waiting for players`
  return joined >= needed
    ? `${joined}/${needed} joined — waiting to start`
    : `${joined}/${needed} joined — waiting for players`
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

// A plain duration ("2 hours", "3 days") — unlike formatTimeRemaining
// above, which frames it as a countdown ("2h left")
export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`
  const hours = Math.floor(seconds / 3600)
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'}`
  const minutes = Math.max(1, Math.floor(seconds / 60))
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
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
