'use client'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import { PlatformStatus } from '@/hooks/useGamesData'

interface Props {
  platformStatuses: Partial<Record<Platform, PlatformStatus>>
  compact?: boolean
}

export default function FetchProgress({ platformStatuses, compact = false }: Props) {
  const platforms = Object.keys(platformStatuses) as Platform[]

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-6 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-500">
        <span className="animate-pulse">⟳ Refreshing…</span>
        {platforms.map(p => {
          const status = platformStatuses[p]
          const state = status?.state ?? 'loading'
          return (
            <span key={p} className="flex items-center gap-1">
              <span className={
                state === 'done' ? 'text-green-400' :
                state === 'error' ? 'text-red-400' :
                'text-slate-500'
              }>
                {state === 'done' ? '✓' : state === 'error' ? '✗' : '⟳'}
              </span>
              <span className={state === 'loading' ? 'animate-pulse' : ''}>
                {PLATFORM_LABELS[p]}
              </span>
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="text-slate-300 text-sm">Fetching your games…</div>
        {platforms.length > 0 && (
          <div className="flex flex-col gap-2 text-sm">
            {platforms.map(p => {
              const status = platformStatuses[p]
              const state = status?.state ?? 'loading'
              return (
                <div key={p} className={`flex items-center gap-2 ${state === 'loading' ? 'animate-pulse' : ''}`}>
                  <span className={
                    state === 'done' ? 'text-green-400 w-4 text-center' :
                    state === 'error' ? 'text-red-400 w-4 text-center' :
                    'text-slate-500 w-4 text-center'
                  }>
                    {state === 'done' ? '✓' : state === 'error' ? '✗' : '⟳'}
                  </span>
                  <span className={state === 'loading' ? 'text-slate-500' : 'text-slate-300'}>
                    {PLATFORM_LABELS[p]}
                  </span>
                  <span className="text-slate-600 text-xs">
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
