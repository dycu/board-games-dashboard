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
      <div className="flex items-center gap-3 px-6 py-2 bg-white border-b border-[#e5e5e5] text-xs text-[#9b9b9b]">
        <span className="animate-pulse">⟳ Refreshing…</span>
        {platforms.map(p => {
          const status = platformStatuses[p]
          const state = status?.state ?? 'loading'
          return (
            <span key={p} className="flex items-center gap-1">
              <span className={
                state === 'done' ? 'text-green-500' :
                state === 'error' ? 'text-red-500' :
                'text-[#9b9b9b]'
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
    <div className="flex-1 flex items-center justify-center bg-[#f7f7f7]">
      <div className="flex flex-col items-center gap-6">
        <div className="text-[#6b6b6b] text-sm">Fetching your games…</div>
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
                    'text-[#9b9b9b] w-4 text-center'
                  }>
                    {state === 'done' ? '✓' : state === 'error' ? '✗' : '⟳'}
                  </span>
                  <span className={state === 'loading' ? 'text-[#9b9b9b]' : 'text-[#1a1a1a]'}>
                    {PLATFORM_LABELS[p]}
                  </span>
                  <span className="text-[#9b9b9b] text-xs">
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
