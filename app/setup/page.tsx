'use client'
import { useEffect, useState } from 'react'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import TopNav from '@/components/TopNav'

const PLATFORMS: Platform[] = ['bga', 'eighteenxx', 'obg', 'yucata', 'choochoo', 'hansa', 'rally']

type Status = 'idle' | 'testing' | 'ok' | 'error'

export default function SetupPage() {
  const [statuses, setStatuses] = useState<Record<Platform, Status>>(
    Object.fromEntries(PLATFORMS.map(p => [p, 'idle'])) as Record<Platform, Status>
  )
  const [errors, setErrors] = useState<Record<Platform, string>>({} as Record<Platform, string>)
  const [disabled, setDisabled] = useState<Set<Platform>>(new Set())
  const [bgaSortCapDays, setBgaSortCapDays] = useState(3)

  useEffect(() => {
    fetch('/api/prefs').then(r => r.json()).then(prefs => {
      setDisabled(new Set(prefs.disabledPlatforms ?? []))
      setBgaSortCapDays(prefs.bgaSortCapDays ?? 3)
    })
  }, [])

  const test = async (platform: Platform) => {
    setStatuses(s => ({ ...s, [platform]: 'testing' }))
    const res = await fetch(`/api/test-connection?platform=${platform}`)
    const data = await res.json()
    setStatuses(s => ({ ...s, [platform]: data.ok ? 'ok' : 'error' }))
    if (!data.ok) setErrors(e => ({ ...e, [platform]: data.error }))
  }

  const togglePlatform = async (platform: Platform) => {
    const next = new Set(disabled)
    if (next.has(platform)) next.delete(platform)
    else next.add(platform)
    setDisabled(next)
    await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabledPlatforms: [...next] }),
    })
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">

        <div className="bg-white rounded-xl border border-[#e5e5e5] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[#1a1a1a] mb-1">BGA sort cap</h2>
          <p className="text-xs text-[#9b9b9b] mb-3">
            BGA doesn&apos;t expose last-move time. Games within this many days of their deadline
            are ranked by urgency; games with more time left appear as not urgent.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={90}
              value={bgaSortCapDays}
              onChange={async e => {
                const val = Math.max(1, Math.min(90, parseInt(e.target.value) || 3))
                setBgaSortCapDays(val)
                await fetch('/api/prefs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ bgaSortCapDays: val }),
                })
              }}
              className="w-20 bg-white text-[#1a1a1a] text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5]"
            />
            <span className="text-sm text-[#6b6b6b]">days</span>
          </div>
        </div>

        <div className="space-y-3">
          {PLATFORMS.map(platform => {
            const status = statuses[platform]
            const enabled = !disabled.has(platform)
            return (
              <div key={platform} className={`bg-white rounded-xl border border-[#e5e5e5] p-5 transition-opacity ${enabled ? '' : 'opacity-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => togglePlatform(platform)}
                      title={enabled ? 'Disable platform' : 'Enable platform'}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-[#5e6ad2]' : 'bg-[#e5e5e5]'}`}>
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                    <h3 className="font-semibold text-[#1a1a1a] truncate">{PLATFORM_LABELS[platform]}</h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {status === 'ok' && <span className="text-xs text-green-600 hidden sm:inline">✓ Connected</span>}
                    {status === 'ok' && <span className="text-xs text-green-600 sm:hidden">✓</span>}
                    {status === 'error' && <span className="text-xs text-red-500 max-w-[80px] truncate" title={errors[platform]}>✗ {errors[platform]}</span>}
                    <button
                      onClick={() => test(platform)}
                      disabled={status === 'testing' || !enabled}
                      className="text-xs bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap">
                      {status === 'testing' ? 'Testing…' : <><span className="hidden sm:inline">Test connection</span><span className="sm:hidden">Test</span></>}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
