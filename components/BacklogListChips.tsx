'use client'
import { BacklogList, BACKLOG_LISTS, SHORT_LIST_LABELS, LIST_LABELS } from '@/lib/backlog/list'

// One toggle per list, all shown at once, so a game can be added to (or
// removed from) any combination of Play/Learn/Solo/Favorite directly —
// no need to pick a single "target" list first.
interface Props {
  lists: BacklogList[]       // which lists this game currently belongs to
  onToggle: (list: BacklogList) => void
  disabled?: boolean
  gameName?: string           // for the aria-label; omit where context already makes it clear
  className?: string
}

export default function BacklogListChips({ lists, onToggle, disabled, gameName, className }: Props) {
  return (
    <div className={`shrink-0 flex items-center gap-1 ${className ?? ''}`}>
      {BACKLOG_LISTS.map(l => {
        const on = lists.includes(l)
        return (
          <button
            key={l}
            onClick={() => onToggle(l)}
            disabled={disabled}
            aria-pressed={on}
            aria-label={gameName ? `${on ? 'Remove' : 'Add'} ${gameName} ${on ? 'from' : 'to'} ${LIST_LABELS[l]}` : LIST_LABELS[l]}
            title={LIST_LABELS[l]}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border whitespace-nowrap transition-colors disabled:opacity-50
              ${on ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#9b9b9b] border-[#e5e5e5] hover:bg-[#f3f3f3]'}`}
          >
            {SHORT_LIST_LABELS[l]}
          </button>
        )
      })}
    </div>
  )
}
