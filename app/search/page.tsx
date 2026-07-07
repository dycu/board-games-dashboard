'use client'
import { useState } from 'react'
import { Platform, PLATFORM_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import TopNav from '@/components/TopNav'

interface GameMatch {
  name: string
  url: string
}

interface PlatformResult {
  platform: Platform
  matches: GameMatch[]
}

interface SearchApiResponse {
  results: PlatformResult[]
  errors: { platform: Platform; error: string }[]
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
        <div className="bg-white rounded-xl border border-[#e5e5e5] p-5 mb-5">
          <h2 className="text-sm font-semibold text-[#1a1a1a] mb-1">Find a game</h2>
          <p className="text-xs text-[#9b9b9b] mb-3">
            Search BGA, Yucata, and Rally the Troops at once to see where a game is available.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
              placeholder="Game name…"
              className="flex-1 bg-white text-[#1a1a1a] text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5]"
            />
            <button
              onClick={runSearch}
              disabled={!query.trim() || isSearching}
              className="text-xs bg-[#5e6ad2] text-white hover:bg-[#4f5ab8] px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
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
                <div key={r.platform} className="bg-white rounded-xl border border-[#e5e5e5] p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[r.platform] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}`}>
                      {PLATFORM_LABELS[r.platform]}
                    </span>
                  </div>
                  {err ? (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">
                      ⚠ {PLATFORM_LABELS[r.platform]} unavailable
                    </span>
                  ) : r.matches.length === 0 ? (
                    <p className="text-xs text-[#9b9b9b]">No match found</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {r.matches.map(m => (
                        <div key={m.url} className="flex items-center justify-between gap-2">
                          <span className="text-sm text-[#1a1a1a]">{m.name}</span>
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium px-3 py-1 rounded-md bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] whitespace-nowrap"
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
