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
