// Distinguishes "user clicked Back after opening a game" from every other
// page load (fresh navigate, reload, or a tablet reopening a tab the OS
// discarded in the background). The Navigation Timing API reports this
// directly, so we don't have to guess from elapsed time.
export function isBackForwardNavigation(): boolean {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return false
  }
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  return entry?.type === 'back_forward'
}

interface ClickLike {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  preventDefault: () => void
}

// Opens a game in its own popup window (not just a browser tab), like
// 18xx.games does, so the user can navigate back/forward inside it or close
// it and land back on an untouched dashboard tab. windowName is stable per
// game (not per click), so re-opening the same game refocuses its existing
// window instead of spawning a duplicate, while different games always get
// separate windows. A non-primary-button or modifier click (middle click,
// ctrl/cmd/shift-click) is left to the browser's own new-tab gesture.
export function openGameWindow(e: ClickLike, url: string, windowName: string): void {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  window.open(url, windowName, 'noopener,noreferrer,width=1400,height=900')
}
