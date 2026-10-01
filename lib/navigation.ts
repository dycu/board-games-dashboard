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
