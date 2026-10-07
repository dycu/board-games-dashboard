'use client'
import { BacklogList } from '@/lib/backlog/list'

export const LIST_LABELS: Record<BacklogList, string> = { play: 'Next to play', learn: 'Next to learn' }

interface Props {
  inList: BacklogList | null
  adding: boolean
  onAdd: () => void
  label?: string
}

export default function AddToBacklogButton({ inList, adding, onAdd, label = '+ Backlog' }: Props) {
  if (inList) {
    return (
      <span className="shrink-0 text-xs font-medium px-3 py-1 rounded-md text-green-700 bg-green-50 border border-green-200 whitespace-nowrap">
        ✓ {inList === 'play' ? 'To play' : 'To learn'}
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
