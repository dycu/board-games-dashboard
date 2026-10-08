'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Active', shortLabel: 'Active' },
  { href: '/overview', label: 'History', shortLabel: 'History' },
  { href: '/backlog', label: 'Backlog', shortLabel: 'Backlog' },
  { href: '/pace', label: 'Pace', shortLabel: 'Pace' },
  { href: '/search', label: 'Find a Game', shortLabel: 'Find' },
  { href: '/setup', label: 'Settings', shortLabel: 'Settings' },
]

export default function TopNav({ right }: { right?: React.ReactNode }) {
  const path = usePathname()
  return (
    <nav className="bg-white border-b border-[#e5e5e5] px-3 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between sm:h-11 shrink-0">
      <div className="flex items-center overflow-x-auto h-11 shrink-0">
        <span className="text-sm font-semibold text-[#1a1a1a] pr-2 sm:pr-4 mr-2 sm:mr-3 border-r border-[#e5e5e5] shrink-0">🎲</span>
        {TABS.map(t => (
          <Link
            key={t.href}
            href={t.href}
            aria-label={t.label}
            className={`text-sm px-1.5 sm:px-3 h-11 flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0
              ${path === t.href || (t.href === '/overview' && !!path?.startsWith('/history'))
                ? 'border-[#5e6ad2] text-[#1a1a1a] font-medium'
                : 'border-transparent text-[#6b6b6b] hover:text-[#1a1a1a]'}`}
          >
            <span className="sm:hidden" aria-hidden="true">{t.shortLabel}</span>
            <span className="hidden sm:inline" aria-hidden="true">{t.label}</span>
          </Link>
        ))}
      </div>
      {right && <div className="text-xs text-[#9b9b9b] flex items-center gap-3 pb-2 sm:pb-0">{right}</div>}
    </nav>
  )
}
