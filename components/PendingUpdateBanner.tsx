'use client'
import { GamesApiResponse } from '@/lib/types'

interface Props {
  pendingData: GamesApiResponse
  onApply: () => void
}

export default function PendingUpdateBanner({ pendingData, onApply }: Props) {
  const fetchedAt = new Date(pendingData.fetchedAt).toLocaleTimeString()
  return (
    <div className="flex items-center gap-3 px-6 py-2 bg-slate-800 border-b border-slate-700 text-sm">
      <span className="text-slate-300">↻ Fresh data ready (fetched at {fetchedAt})</span>
      <button
        onClick={onApply}
        className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-md"
      >
        Apply
      </button>
    </div>
  )
}
