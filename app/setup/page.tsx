'use client'
import { useEffect, useState } from 'react'
import { Platform, UserPrefs, PLATFORM_LABELS, DEFAULT_BACKLOG_PLATFORMS } from '@/lib/types'
import { CheckResult } from '@/lib/newGames/check'
import TopNav from '@/components/TopNav'
import PlatformFilterChips from '@/components/PlatformFilterChips'

const PLATFORMS: Platform[] = ['bga', 'eighteenxx', 'obg', 'yucata', 'choochoo', 'hansa', 'rally', 'oldkingscrown', 'boardgamers', 'boardtogether']

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
  const [bgaCookieInput, setBgaCookieInput] = useState('')
  const [bgaPlayerIdInput, setBgaPlayerIdInput] = useState('')
  const [bgaCookieSaving, setBgaCookieSaving] = useState(false)
  const [bgaCookieSaved, setBgaCookieSaved] = useState(false)
  const [savedBgaPlayerId, setSavedBgaPlayerId] = useState('')
  const [theme, setTheme] = useState<UserPrefs['theme']>(undefined)
  const [okcGameIds, setOkcGameIds] = useState<string[]>([])
  const [okcInput, setOkcInput] = useState('')
  const [okcSaving, setOkcSaving] = useState(false)
  const [okcStatus, setOkcStatus] = useState<Record<string, OkcConfiguredStatus>>({})
  const [okcStatusLoading, setOkcStatusLoading] = useState(false)
  const [newGamesChecking, setNewGamesChecking] = useState(false)
  const [newGamesResult, setNewGamesResult] = useState<CheckResult | null>(null)
  const [newGamesError, setNewGamesError] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'error'>('idle')

  const exportData = async () => {
    setExportStatus('exporting')
    try {
      const res = await fetch('/api/export')
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `board-games-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportStatus('idle')
    } catch {
      setExportStatus('error')
    }
  }

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
      setBgaCookieSaved(!!prefs.bgaSessionCookie && !!prefs.bgaPlayerId)
      setSavedBgaPlayerId(prefs.bgaPlayerId ?? '')
      setTheme(prefs.theme)
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

  // Normal operation never needs this — automated login succeeds and
  // re-saves its own fresh cookie here automatically. This is only for
  // bootstrapping (or recovering) while BGA is blocking automated logins.
  const saveBgaCookie = async (cookie: string, playerId: string) => {
    setBgaCookieSaving(true)
    await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bgaSessionCookie: cookie, bgaPlayerId: playerId }),
    })
    setBgaCookieSaved(!!cookie && !!playerId)
    setSavedBgaPlayerId(playerId)
    setBgaCookieInput('')
    setBgaPlayerIdInput('')
    setBgaCookieSaving(false)
  }

  // Applied immediately (no reload) via the data-theme attribute the CSS
  // keys off of, and written straight into the same localStorage cache
  // usePrefs() reads (see hooks/usePrefs.ts) so the next page load's
  // anti-flash script (app/layout.tsx) picks it up before the server
  // round trip even starts, not just after this page's own POST resolves.
  const saveTheme = async (next: UserPrefs['theme']) => {
    setTheme(next)
    if (next) document.documentElement.setAttribute('data-theme', next)
    else document.documentElement.removeAttribute('data-theme')
    try {
      const cached = JSON.parse(localStorage.getItem('user-prefs') ?? '{}')
      localStorage.setItem('user-prefs', JSON.stringify({ ...cached, theme: next }))
    } catch { /* storage unavailable */ }
    await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // null (not undefined) so the field is actually cleared server-side —
      // omitting it from the JSON body would leave a previously-saved
      // override in place instead of resetting to "follow the system"
      body: JSON.stringify({ theme: next ?? null }),
    })
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

  const changeBacklogPlatforms = async (next: Platform[]) => {
    // Keep PLATFORMS's own order rather than whatever order chips were
    // clicked in
    const ordered = PLATFORMS.filter(p => next.includes(p))
    setBacklogPlatforms(ordered)
    await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backlogPlatforms: ordered }),
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

  const checkNewGamesNow = async () => {
    setNewGamesChecking(true)
    setNewGamesError(null)
    try {
      const res = await fetch('/api/new-games/sync', { method: 'POST' })
      const data = await res.json()
      if (data.error) setNewGamesError(data.error)
      else setNewGamesResult(data)
    } catch (e) {
      setNewGamesError(e instanceof Error ? e.message : 'Check failed')
    } finally {
      setNewGamesChecking(false)
    }
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

        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Opponent slow-play threshold</h2>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">
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
              className="w-20 bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm px-3 py-1.5 rounded-md border border-[var(--border-default)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">days</span>
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Deadline soon threshold</h2>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">
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
              className="w-20 bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm px-3 py-1.5 rounded-md border border-[var(--border-default)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">hours</span>
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Appearance</h2>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">
            System follows your OS/browser&apos;s own light/dark setting; Light and Dark pin it
            regardless of that.
          </p>
          <div className="flex gap-[2px] bg-[var(--bg-subtle)] rounded-md p-[3px] w-fit">
            {([[undefined, 'System'], ['light', 'Light'], ['dark', 'Dark']] as const).map(([value, label]) => (
              <button
                key={label}
                onClick={() => saveTheme(value)}
                className={`whitespace-nowrap text-xs px-3 py-1 rounded font-medium transition-colors
                  ${theme === value
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                    : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">New games check</h2>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">
            Runs automatically twice a day: new games and release-stage changes on BGA (alpha
            included), 18xx.games, Rally the Troops, Yucata, choochoo.games, Boardgamers.space and
            BoardTogether. Emails what it finds — check now instead of waiting for the next
            scheduled run, or browse everything found so far on the New Games page.
          </p>
          <button
            onClick={checkNewGamesNow}
            disabled={newGamesChecking}
            className="text-xs bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {newGamesChecking ? 'Checking…' : 'Check now'}
          </button>
          {newGamesError && <p className="text-xs text-red-500 mt-2">⚠ {newGamesError}</p>}
          {newGamesResult && (
            <div className="text-xs text-[var(--text-secondary)] mt-2">
              {newGamesResult.events.length === 0 ? (
                'No new games or changes found.'
              ) : (
                <>
                  Found {newGamesResult.events.length} {newGamesResult.events.length === 1 ? 'item' : 'items'}:{' '}
                  {newGamesResult.events.slice(0, 5).map(e => e.name).join(', ')}
                  {newGamesResult.events.length > 5 && `, +${newGamesResult.events.length - 5} more`}.
                  {newGamesResult.email && (
                    newGamesResult.email.sent ? ' Email sent.' : ` Email not sent (${newGamesResult.email.reason}).`
                  )}
                </>
              )}
              {Object.keys(newGamesResult.errors).length > 0 && (
                <div className="text-amber-600 mt-1">
                  ⚠ {Object.entries(newGamesResult.errors).map(([src, err]) => `${src}: ${err}`).join('; ')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Backup</h2>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">
            Downloads everything this app itself stores — table notes and labels, backlog lists,
            opponent tags, achievements and settings — as one JSON file. Not the live game/history
            data each site already keeps on its own; just what only lives here.
          </p>
          <button
            onClick={exportData}
            disabled={exportStatus === 'exporting'}
            className="text-xs bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {exportStatus === 'exporting' ? 'Exporting…' : '⬇ Export data'}
          </button>
          {exportStatus === 'error' && <p className="text-xs text-red-500 mt-2">Export failed — try again.</p>}
        </div>

        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Backlog sites</h2>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">
            Sites shown when adding games on the Backlog page. Others can still be switched on there.
          </p>
          <PlatformFilterChips
            platforms={PLATFORMS}
            selected={backlogPlatforms}
            onChange={changeBacklogPlatforms}
          />
        </div>

        <div className="space-y-3">
          {PLATFORMS.map(platform => {
            const status = statuses[platform]
            const enabled = !disabled.has(platform)
            return (
              <div key={platform} className={`bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5 transition-opacity ${enabled ? '' : 'opacity-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => togglePlatform(platform)}
                      title={enabled ? 'Disable platform' : 'Enable platform'}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-[var(--accent)]' : 'bg-[var(--border-default)]'}`}>
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-[var(--bg-surface)] transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                    <h3 className="font-semibold text-[var(--text-primary)] truncate">{PLATFORM_LABELS[platform]}</h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {status === 'ok' && <span className="text-xs text-green-600 hidden sm:inline">✓ Connected</span>}
                    {status === 'ok' && <span className="text-xs text-green-600 sm:hidden">✓</span>}
                    {status === 'error' && <span className="text-xs text-red-500 max-w-[80px] truncate" title={errors[platform]}>✗ {errors[platform]}</span>}
                    <button
                      onClick={() => test(platform)}
                      disabled={status === 'testing' || !enabled}
                      className="text-xs bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap">
                      {status === 'testing' ? 'Testing…' : <><span className="hidden sm:inline">Test connection</span><span className="sm:hidden">Test</span></>}
                    </button>
                  </div>
                </div>
                {platform === 'bga' && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                    <p className="text-xs text-[var(--text-tertiary)] mb-2">
                      Normally nothing to do here — logging in saves its own session below automatically.
                      Only paste one yourself if automated login is stuck (e.g. BGA blocking it): log in to
                      BGA in your browser, open DevTools → Network, find any request to boardgamearena.com,
                      and copy its <code>Cookie</code> request header. The player id below only needs
                      setting once — refreshing the cookie later doesn&apos;t need it again.
                    </p>
                    <div className="flex flex-col gap-2">
                      <input
                        type="password"
                        value={bgaCookieInput}
                        onChange={e => setBgaCookieInput(e.target.value)}
                        placeholder={bgaCookieSaved ? '●●●●● saved' : 'Paste Cookie header value…'}
                        className="text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-1.5 rounded-md border border-[var(--border-default)] font-mono"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={bgaPlayerIdInput}
                          onChange={e => setBgaPlayerIdInput(e.target.value)}
                          placeholder={savedBgaPlayerId ? `saved: ${savedBgaPlayerId}` : 'Numeric player id (visible in your profile’s URL)…'}
                          className="flex-1 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-1.5 rounded-md border border-[var(--border-default)] font-mono"
                        />
                        <button
                          onClick={() => saveBgaCookie(bgaCookieInput, bgaPlayerIdInput || savedBgaPlayerId)}
                          disabled={!bgaCookieInput || !(bgaPlayerIdInput || savedBgaPlayerId) || bgaCookieSaving}
                          className="text-xs bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
                        >
                          {bgaCookieSaving ? 'Saving…' : 'Save'}
                        </button>
                        {bgaCookieSaved && (
                          <button
                            onClick={() => { saveBgaCookie('', ''); setSavedBgaPlayerId('') }}
                            disabled={bgaCookieSaving}
                            className="text-xs bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] px-3 py-1.5 rounded-md disabled:opacity-50"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {platform === 'eighteenxx' && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                    <p className="text-xs text-[var(--text-tertiary)] mb-2">
                      Auth token — log in to 18xx.games in your browser, open DevTools → Application → Cookies → <code>18xx.games</code> → copy the value of the <code>auth_token</code> cookie and paste it here.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={cookieInput}
                        onChange={e => setCookieInput(e.target.value)}
                        placeholder={cookieSaved ? '●●●●● saved' : 'Paste cookie value…'}
                        className="flex-1 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-1.5 rounded-md border border-[var(--border-default)] font-mono"
                      />
                      <button
                        onClick={() => saveCookie(cookieInput)}
                        disabled={!cookieInput || cookieSaving}
                        className="text-xs bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
                      >
                        {cookieSaving ? 'Saving…' : 'Save'}
                      </button>
                      {cookieSaved && (
                        <button
                          onClick={() => saveCookie('')}
                          disabled={cookieSaving}
                          className="text-xs bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] px-3 py-1.5 rounded-md disabled:opacity-50"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {platform === 'oldkingscrown' && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                    <p className="text-xs text-[var(--text-tertiary)] mb-2">
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
                        className="flex-1 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-1.5 rounded-md border border-[var(--border-default)] font-mono"
                      />
                      <button
                        onClick={addOkcGameId}
                        disabled={!okcInput.trim() || okcSaving}
                        className="text-xs bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
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
                            className="text-[11px] text-[var(--accent)] hover:underline disabled:opacity-50"
                          >
                            {okcStatusLoading ? 'Checking…' : '↻ Refresh status'}
                          </button>
                        </div>
                        <ul className="space-y-1">
                          {okcGameIds.map(id => {
                            const info = okcStatus[id]
                            const flagged = info?.status === 'finished' || info?.status === 'error' || info?.status === 'not-member'
                            return (
                              <li key={id} className={`flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-md ${flagged ? 'bg-amber-50' : 'bg-[var(--bg-muted)]'}`}>
                                <div className="min-w-0">
                                  <div className="font-mono text-[var(--text-secondary)] truncate">{id}</div>
                                  {info && (
                                    <div className={`truncate ${info.status === 'error' ? 'text-red-600' : flagged ? 'text-amber-700' : 'text-[var(--text-tertiary)]'}`}>
                                      {info.status === 'active' && `vs ${info.players.join(', ') || '…'} — ${info.game?.myTurn ? 'your turn' : info.game?.currentPlayer ? `waiting for ${info.game.currentPlayer}` : 'waiting'}`}
                                      {info.status === 'finished' && `Finished — vs ${info.players.join(', ')} · safe to remove`}
                                      {info.status === 'not-member' && `You're not seated here (players: ${info.players.join(', ') || 'unknown'}) · safe to remove`}
                                      {info.status === 'error' && `⚠ ${info.error}`}
                                    </div>
                                  )}
                                </div>
                                {/* The game URL only ever needs the id — not the fetched
                                    snapshot — so this works the same whether the game is
                                    still active, finished, or failed to load just now. */}
                                <a
                                  href={`https://oldkingscrown.fly.dev/game/${id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 text-[var(--accent)] hover:underline whitespace-nowrap"
                                >
                                  Open ↗
                                </a>
                                <button
                                  onClick={() => removeOkcGameId(id)}
                                  disabled={okcSaving}
                                  className="text-[var(--text-tertiary)] hover:text-red-500 shrink-0"
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
