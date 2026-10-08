'use client'
import { useEffect, useState } from 'react'
import { Platform, PLATFORM_LABELS, DEFAULT_BACKLOG_PLATFORMS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import TopNav from '@/components/TopNav'

const PLATFORMS: Platform[] = ['bga', 'eighteenxx', 'obg', 'yucata', 'choochoo', 'hansa', 'rally', 'oldkingscrown']

type Status = 'idle' | 'testing' | 'ok' | 'error'

interface OkcConfiguredStatus {
  gameId: string
  status: 'active' | 'finished' | 'not-member' | 'error'
  players: string[]
  game?: { myTurn: boolean; currentPlayer?: string }
  error?: string
}

export default function SetupPage() {
  const [statuses, setStatuses] = useState<Record<Platform, Status>>(
    Object.fromEntries(PLATFORMS.map(p => [p, 'idle'])) as Record<Platform, Status>
  )
  const [errors, setErrors] = useState<Record<Platform, string>>({} as Record<Platform, string>)
  const [disabled, setDisabled] = useState<Set<Platform>>(new Set())
  const [opponentSlowDays, setOpponentSlowDays] = useState(5)
  const [deadlineSoonHours, setDeadlineSoonHours] = useState(24)
  const [backlogPlatforms, setBacklogPlatforms] = useState<Platform[]>(DEFAULT_BACKLOG_PLATFORMS)
  const [cookieInput, setCookieInput] = useState('')
  const [cookieSaving, setCookieSaving] = useState(false)
  const [cookieSaved, setCookieSaved] = useState(false)
  const [okcGameIds, setOkcGameIds] = useState<string[]>([])
  const [okcInput, setOkcInput] = useState('')
  const [okcSaving, setOkcSaving] = useState(false)
  const [okcStatus, setOkcStatus] = useState<Record<string, OkcConfiguredStatus>>({})
  const [okcStatusLoading, setOkcStatusLoading] = useState(false)

  const loadOkcStatus = async () => {
    setOkcStatusLoading(true)
    try {
      const res = await fetch('/api/oldkingscrown')
      const data = await res.json()
      const byId: Record<string, OkcConfiguredStatus> = {}
      for (const c of data.configured ?? []) byId[c.gameId] = c
      setOkcStatus(byId)
    } finally {
      setOkcStatusLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/prefs').then(r => r.json()).then(prefs => {
      setDisabled(new Set(prefs.disabledPlatforms ?? []))
      setOpponentSlowDays(prefs.opponentSlowDays ?? 5)
      setDeadlineSoonHours(prefs.deadlineSoonHours ?? 24)
      setBacklogPlatforms(prefs.backlogPlatforms ?? DEFAULT_BACKLOG_PLATFORMS)
      setCookieSaved(!!prefs.eighteenxxSessionCookie)
      const ids = prefs.oldkingscrownGameIds ?? []
      setOkcGameIds(ids)
      if (ids.length > 0) loadOkcStatus()
    })
  }, [])

  const test = async (platform: Platform) => {
    setStatuses(s => ({ ...s, [platform]: 'testing' }))
    const res = await fetch(`/api/test-connection?platform=${platform}`)
    const data = await res.json()
    setStatuses(s => ({ ...s, [platform]: data.ok ? 'ok' : 'error' }))
    if (!data.ok) setErrors(e => ({ ...e, [platform]: data.error }))
  }

  const saveCookie = async (value: string) => {
    setCookieSaving(true)
    await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eighteenxxSessionCookie: value }),
    })
    setCookieSaved(!!value)
    setCookieInput('')
    setCookieSaving(false)
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

  const toggleBacklogPlatform = async (platform: Platform) => {
    const next = backlogPlatforms.includes(platform)
      ? backlogPlatforms.filter(p => p !== platform)
      : PLATFORMS.filter(p => p === platform || backlogPlatforms.includes(p))
    setBacklogPlatforms(next)
    await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backlogPlatforms: next }),
    })
  }

  const saveOkcGameIds = async (ids: string[]) => {
    setOkcSaving(true)
    setOkcGameIds(ids)
    await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldkingscrownGameIds: ids }),
    })
    setOkcSaving(false)
  }

  const addOkcGameId = async () => {
    // Accept either a bare id or a full https://oldkingscrown.fly.dev/game/<id> URL
    const id = okcInput.trim().split('/').filter(Boolean).pop()
    if (!id || okcGameIds.includes(id)) { setOkcInput(''); return }
    await saveOkcGameIds([...okcGameIds, id])
    setOkcInput('')
    loadOkcStatus()
  }

  const removeOkcGameId = async (id: string) => {
    await saveOkcGameIds(okcGameIds.filter(g => g !== id))
    setOkcStatus(s => { const next = { ...s }; delete next[id]; return next })
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">

        <div className="bg-white rounded-xl border border-[#e5e5e5] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[#1a1a1a] mb-1">Opponent slow-play threshold</h2>
          <p className="text-xs text-[#9b9b9b] mb-3">
            Highlight waiting games with an urgency indicator when the opponent hasn&apos;t moved in this many days.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={90}
              value={opponentSlowDays}
              onChange={async e => {
                const val = Math.max(1, Math.min(90, parseInt(e.target.value) || 5))
                setOpponentSlowDays(val)
                await fetch('/api/prefs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ opponentSlowDays: val }),
                })
              }}
              className="w-20 bg-white text-[#1a1a1a] text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5]"
            />
            <span className="text-sm text-[#6b6b6b]">days</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#e5e5e5] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[#1a1a1a] mb-1">Deadline soon threshold</h2>
          <p className="text-xs text-[#9b9b9b] mb-3">
            Flag a my-turn game with the red &quot;time&apos;s running out&quot; indicator once its deadline is under this many hours away.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={72}
              value={deadlineSoonHours}
              onChange={async e => {
                const val = Math.max(1, Math.min(72, parseInt(e.target.value) || 24))
                setDeadlineSoonHours(val)
                await fetch('/api/prefs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ deadlineSoonHours: val }),
                })
              }}
              className="w-20 bg-white text-[#1a1a1a] text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5]"
            />
            <span className="text-sm text-[#6b6b6b]">hours</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#e5e5e5] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[#1a1a1a] mb-1">Backlog sites</h2>
          <p className="text-xs text-[#9b9b9b] mb-3">
            Sites shown when adding games on the Backlog page. Others can still be switched on there.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map(p => (
              <button
                key={p}
                onClick={() => toggleBacklogPlatform(p)}
                aria-pressed={backlogPlatforms.includes(p)}
                className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full transition-opacity
                  ${BADGE_COLORS[p] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}
                  ${backlogPlatforms.includes(p) ? 'opacity-100 ring-2 ring-[#1a1a1a]/20' : 'opacity-40 hover:opacity-70'}`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
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
                {platform === 'eighteenxx' && (
                  <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
                    <p className="text-xs text-[#9b9b9b] mb-2">
                      Auth token — log in to 18xx.games in your browser, open DevTools → Application → Cookies → <code>18xx.games</code> → copy the value of the <code>auth_token</code> cookie and paste it here.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={cookieInput}
                        onChange={e => setCookieInput(e.target.value)}
                        placeholder={cookieSaved ? '●●●●● saved' : 'Paste cookie value…'}
                        className="flex-1 text-xs bg-white text-[#1a1a1a] px-3 py-1.5 rounded-md border border-[#e5e5e5] font-mono"
                      />
                      <button
                        onClick={() => saveCookie(cookieInput)}
                        disabled={!cookieInput || cookieSaving}
                        className="text-xs bg-[#5e6ad2] text-white hover:bg-[#4f5ab8] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
                      >
                        {cookieSaving ? 'Saving…' : 'Save'}
                      </button>
                      {cookieSaved && (
                        <button
                          onClick={() => saveCookie('')}
                          disabled={cookieSaving}
                          className="text-xs bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3 py-1.5 rounded-md disabled:opacity-50"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {platform === 'oldkingscrown' && (
                  <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
                    <p className="text-xs text-[#9b9b9b] mb-2">
                      No accounts on this site, so games you&apos;re playing can&apos;t be discovered
                      automatically — paste each game&apos;s URL (or just its id) here once to track it.
                    </p>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={okcInput}
                        onChange={e => setOkcInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addOkcGameId() }}
                        placeholder="https://oldkingscrown.fly.dev/game/…"
                        className="flex-1 text-xs bg-white text-[#1a1a1a] px-3 py-1.5 rounded-md border border-[#e5e5e5] font-mono"
                      />
                      <button
                        onClick={addOkcGameId}
                        disabled={!okcInput.trim() || okcSaving}
                        className="text-xs bg-[#5e6ad2] text-white hover:bg-[#4f5ab8] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
                      >
                        Add
                      </button>
                    </div>
                    {okcGameIds.length > 0 && (
                      <>
                        <div className="flex justify-end mb-1">
                          <button
                            onClick={loadOkcStatus}
                            disabled={okcStatusLoading}
                            className="text-[11px] text-[#5e6ad2] hover:underline disabled:opacity-50"
                          >
                            {okcStatusLoading ? 'Checking…' : '↻ Refresh status'}
                          </button>
                        </div>
                        <ul className="space-y-1">
                          {okcGameIds.map(id => {
                            const info = okcStatus[id]
                            const flagged = info?.status === 'finished' || info?.status === 'error' || info?.status === 'not-member'
                            return (
                              <li key={id} className={`flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-md ${flagged ? 'bg-amber-50' : 'bg-[#f3f3f3]'}`}>
                                <div className="min-w-0">
                                  <div className="font-mono text-[#6b6b6b] truncate">{id}</div>
                                  {info && (
                                    <div className={`truncate ${info.status === 'error' ? 'text-red-600' : flagged ? 'text-amber-700' : 'text-[#9b9b9b]'}`}>
                                      {info.status === 'active' && `vs ${info.players.join(', ') || '…'} — ${info.game?.myTurn ? 'your turn' : info.game?.currentPlayer ? `waiting for ${info.game.currentPlayer}` : 'waiting'}`}
                                      {info.status === 'finished' && `Finished — vs ${info.players.join(', ')} · safe to remove`}
                                      {info.status === 'not-member' && `You're not seated here (players: ${info.players.join(', ') || 'unknown'}) · safe to remove`}
                                      {info.status === 'error' && `⚠ ${info.error}`}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => removeOkcGameId(id)}
                                  disabled={okcSaving}
                                  className="text-[#9b9b9b] hover:text-red-500 shrink-0"
                                  aria-label="Stop tracking"
                                >
                                  ✕
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
