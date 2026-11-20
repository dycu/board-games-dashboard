'use client'
import { PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import { NewGameEvent, eventLabel } from '@/lib/newGames/diff'
import { BacklogList } from '@/lib/backlog/list'
import BacklogListChips from './BacklogListChips'
import InviteAgainButton from './InviteAgainButton'

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
      <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${BADGE_COLORS[event.platform] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'}`}>
        {PLATFORM_SHORT_LABELS[event.platform]}
      </span>
      <div className="flex-1 min-w-[140px]">
        <a href={event.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-[var(--text-primary)] hover:underline">
          {event.name}
        </a>
        <span className="text-xs text-[var(--text-tertiary)]">{eventLabel(event)}</span>
      </div>
      <InviteAgainButton platform={event.platform} gameName={event.name} url={event.url} />
      <BacklogListChips lists={lists} disabled={disabled} onToggle={onToggle} />
    </li>
  )
}
