'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Active', shortLabel: 'Active' },
  { href: '/overview', label: 'History', shortLabel: 'History' },
  { href: '/players', label: 'Players', shortLabel: 'Players' },
  { href: '/achievements', label: 'Achievements', shortLabel: 'Goals' },
  { href: '/backlog', label: 'Backlog', shortLabel: 'Backlog' },
  { href: '/pace', label: 'Pace', shortLabel: 'Pace' },
  { href: '/search', label: 'Find a Game', shortLabel: 'Find' },
  { href: '/new-games', label: 'New Games', shortLabel: 'New' },
  { href: '/setup', label: 'Settings', shortLabel: 'Settings' },
]

export default function TopNav({ right }: { right?: React.ReactNode }) {
  const path = usePathname()
  return (
    <nav className="bg-[var(--bg-surface)] border-b border-[var(--border-default)] px-3 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between sm:h-11 shrink-0">
      <div className="flex items-center overflow-x-auto h-11 shrink-0">
        <span className="text-sm font-semibold text-[var(--text-primary)] pr-2 sm:pr-4 mr-2 sm:mr-3 border-r border-[var(--border-default)] shrink-0">🎲</span>
        {TABS.map(t => (
          <Link
            key={t.href}
            href={t.href}
            aria-label={t.label}
            className={`text-sm px-1.5 sm:px-3 h-11 flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0
              ${path === t.href || (t.href === '/overview' && !!path?.startsWith('/history'))
                ? 'border-[var(--accent)] text-[var(--text-primary)] font-medium'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >
            <span className="sm:hidden" aria-hidden="true">{t.shortLabel}</span>
            <span className="hidden sm:inline" aria-hidden="true">{t.label}</span>
          </Link>
        ))}
      </div>
      {right && <div className="text-xs text-[var(--text-tertiary)] flex items-center gap-3 pb-2 sm:pb-0">{right}</div>}
    </nav>
  )
}
