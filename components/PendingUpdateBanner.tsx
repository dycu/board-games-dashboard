'use client'
import { GamesApiResponse } from '@/lib/types'

interface Props {
  pendingData: GamesApiResponse
  onApply: () => void
}

export default function PendingUpdateBanner({ pendingData, onApply }: Props) {
  const fetchedAt = new Date(pendingData.fetchedAt).toLocaleTimeString()
  return (
    <div className="flex items-center gap-3 px-6 py-2 bg-white border-b border-[#e5e5e5] text-sm">
      <span className="text-[#6b6b6b]">↻ Fresh data ready (fetched at {fetchedAt})</span>
      <button
        onClick={onApply}
        className="text-xs bg-[#5e6ad2] hover:bg-[#4f5ab8] text-white px-3 py-1 rounded-md"
      >
        Apply
      </button>
    </div>
  )
}
