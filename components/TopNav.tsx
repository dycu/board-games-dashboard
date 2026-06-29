'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Active' },
  { href: '/overview', label: 'History' },
  { href: '/setup', label: 'Settings' },
]

export default function TopNav({ right }: { right?: React.ReactNode }) {
  const path = usePathname()
  return (
    <nav className="bg-white border-b border-[#e5e5e5] px-5 flex items-center justify-between h-11 shrink-0">
      <div className="flex items-center">
        <span className="text-sm font-semibold text-[#1a1a1a] pr-4 mr-3 border-r border-[#e5e5e5]">🎲</span>
        {TABS.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className={`text-sm px-3 h-11 flex items-center border-b-2 transition-colors
              ${path === t.href
                ? 'border-[#5e6ad2] text-[#1a1a1a] font-medium'
                : 'border-transparent text-[#6b6b6b] hover:text-[#1a1a1a]'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {right && <div className="text-xs text-[#9b9b9b] flex items-center gap-3">{right}</div>}
    </nav>
  )
}
