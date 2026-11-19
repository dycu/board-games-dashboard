'use client'
import { useState } from 'react'
import { PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import TopNav from '@/components/TopNav'

// Catalog-only platforms (search support, no live game tracking) aren't part
// of lib/types.ts's Platform union, so this page can't rely on PLATFORM_LABELS/
// PLATFORM_SHORT_LABELS having an entry for every result — these cover the gap.
const EXTRA_PLATFORM_LABELS: Record<string, string> = {
  boardtogether: 'BoardTogether',
  tabletapas: 'TableTapas',
}
const EXTRA_PLATFORM_SHORT_LABELS: Record<string, string> = {
  boardtogether: 'B2gthr',
  tabletapas: 'TblTapas',
}
const platformLabel = (p: string) => PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS] ?? EXTRA_PLATFORM_LABELS[p] ?? p
const platformShortLabel = (p: string) => PLATFORM_SHORT_LABELS[p as keyof typeof PLATFORM_SHORT_LABELS] ?? EXTRA_PLATFORM_SHORT_LABELS[p] ?? p

interface GameMatch {
  name: string
  url: string
}

interface PlatformResult {
  platform: string
  matches: GameMatch[]
}

interface SearchApiResponse {
  results: PlatformResult[]
  errors: { platform: string; error: string }[]
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [data, setData] = useState<SearchApiResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const runSearch = async () => {
    const q = query.trim()
    if (!q) return
    setIsSearching(true)
    try {
      const res = await fetch(`/api/game-search?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setData(json)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Find a game</h2>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">
            Search BGA, Yucata, Rally the Troops, 18xx.games, choochoo.games, OnlineBoardGamers, BoardTogether, TableTapas and Boardgamers.space at once to see where a game is available.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
              placeholder="Game name…"
              className="flex-1 bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm px-3 py-1.5 rounded-md border border-[var(--border-default)]"
            />
            <button
              onClick={runSearch}
              disabled={!query.trim() || isSearching}
              className="text-xs bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
            >
              {isSearching ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>

        {data && (
          <div className="space-y-3">
            {data.results.map(r => {
              const err = data.errors.find(e => e.platform === r.platform)
              return (
                <div key={r.platform} className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span title={platformLabel(r.platform)} className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[r.platform] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'}`}>
                      {platformShortLabel(r.platform)}
                    </span>
                  </div>
                  {err ? (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
                      ⚠ {platformLabel(r.platform)} unavailable
                    </span>
                  ) : r.matches.length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)]">No match found</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {r.matches.map(m => (
                        <div key={m.name} className="flex items-center justify-between gap-2">
                          <span className="text-sm text-[var(--text-primary)]">{m.name}</span>
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium px-3 py-1 rounded-md bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] whitespace-nowrap"
                          >
                            Open →
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
