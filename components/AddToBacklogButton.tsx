'use client'
import { BacklogList } from '@/lib/backlog/list'

export const LIST_LABELS: Record<BacklogList, string> = { play: 'Next to play', learn: 'Next to learn', solo: 'Solo', favorite: 'Favorite' }

// The ✓ status badge: present-tense, shorter than the section/pill labels above
const STATUS_LABELS: Record<BacklogList, string> = { play: 'To play', learn: 'To learn', solo: 'Solo', favorite: 'Favorite' }

interface Props {
  // Whether the game is already in the specific list this button adds to —
  // a game can be in other lists too (e.g. also Solo) without affecting this
  targetList: BacklogList
  inTarget: boolean
  adding: boolean
  onAdd: () => void
  label?: string
}

export default function AddToBacklogButton({ targetList, inTarget, adding, onAdd, label = '+ Backlog' }: Props) {
  if (inTarget) {
    return (
      <span className="shrink-0 text-xs font-medium px-3 py-1 rounded-md text-green-700 bg-green-50 border border-green-200 whitespace-nowrap">
        ✓ {STATUS_LABELS[targetList]}
      </span>
    )
  }
  return (
    <button
      onClick={onAdd}
      disabled={adding}
      className="shrink-0 text-xs font-medium px-3 py-1 rounded-md bg-white text-[#5e6ad2] border border-[#c9cdf2] hover:bg-[#f2f3fc] disabled:opacity-50 whitespace-nowrap"
    >
      {adding ? 'Adding…' : label}
    </button>
  )
}
