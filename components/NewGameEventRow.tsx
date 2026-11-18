'use client'
import { PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { NewGameEvent, eventLabel } from '@/lib/newGames/diff'
import { BacklogList } from '@/lib/backlog/list'
import BacklogListChips from './BacklogListChips'

interface Props {
  event: NewGameEvent
  lists: BacklogList[]
  disabled: boolean
  onToggle: (list: BacklogList) => void
}

// One row: platform badge, name/link, what changed, and the same backlog
// chips every other game list in the app uses — shared by the dismissable
// popup and the persistent /new-games page so they never drift apart.
export default function NewGameEventRow({ event, lists, disabled, onToggle }: Props) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 min-w-0">
      <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${BADGE_COLORS[event.platform] ?? 'bg-[#f3f3f3] text-[#6b6b6b]'}`}>
        {PLATFORM_SHORT_LABELS[event.platform]}
      </span>
      <div className="flex-1 min-w-[140px]">
        <a href={event.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-[#1a1a1a] hover:underline">
          {event.name}
        </a>
        <span className="text-xs text-[#8a8a8a]">{eventLabel(event)}</span>
      </div>
      {event.kind !== 'post' && (
        <BacklogListChips lists={lists} disabled={disabled} onToggle={onToggle} />
      )}
    </li>
  )
}
