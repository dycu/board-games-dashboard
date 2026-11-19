'use client'
import { Platform, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { PlatformStatus } from '@/hooks/useGamesData'

interface Props {
  platformStatuses: Partial<Record<Platform, PlatformStatus>>
  compact?: boolean
}

export default function FetchProgress({ platformStatuses, compact = false }: Props) {
  const platforms = Object.keys(platformStatuses) as Platform[]

  if (compact) {
    // Floats over the page, so a refresh never shifts the content: a thin bar
    // along the top edge and a small note of what's still loading
    const done = platforms.filter(p => platformStatuses[p]?.state !== 'loading').length
    const loading = platforms.filter(p => (platformStatuses[p]?.state ?? 'loading') === 'loading')
    const failed = platforms.filter(p => platformStatuses[p]?.state === 'error')
    const pct = platforms.length ? Math.max(8, Math.round(100 * done / platforms.length)) : 8
    return (
      <>
        <div className="fixed top-0 left-0 right-0 h-0.5 z-50 pointer-events-none" role="progressbar" aria-label="Refreshing" aria-valuenow={pct}>
          <div className="h-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="fixed bottom-3 right-3 z-50 pointer-events-none text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface)]/90 border border-[var(--border-default)] rounded-full px-2.5 py-1 shadow-sm">
          <span className="animate-pulse">⟳</span>{' '}
          {loading.length > 0 ? `Updating ${loading.map(p => PLATFORM_SHORT_LABELS[p]).join(', ')}` : 'Updating…'}
          {failed.length > 0 && <span className="text-red-500"> · {failed.map(p => PLATFORM_SHORT_LABELS[p]).join(', ')} failed</span>}
        </div>
      </>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-[var(--bg-page)]">
      <div className="flex flex-col items-center gap-6">
        <div className="text-[var(--text-secondary)] text-sm">Fetching your games…</div>
        {platforms.length > 0 && (
          <div className="flex flex-col gap-2 text-sm">
            {platforms.map(p => {
              const status = platformStatuses[p]
              const state = status?.state ?? 'loading'
              return (
                <div key={p} className={`flex items-center gap-2 ${state === 'loading' ? 'animate-pulse' : ''}`}>
                  <span className={
                    state === 'done' ? 'text-green-500 w-4 text-center' :
                    state === 'error' ? 'text-red-500 w-4 text-center' :
                    'text-[var(--text-tertiary)] w-4 text-center'
                  }>
                    {state === 'done' ? '✓' : state === 'error' ? '✗' : '⟳'}
                  </span>
                  <span className={state === 'loading' ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}>
                    {PLATFORM_LABELS[p]}
                  </span>
                  <span className="text-[var(--text-tertiary)] text-xs">
                    {state === 'done' && `— ${(status as { state: 'done'; count: number }).count} games`}
                    {state === 'error' && '— failed'}
                    {state === 'loading' && '— loading…'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
