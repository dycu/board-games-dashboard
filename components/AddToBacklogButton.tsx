'use client'

interface Props {
  inBacklog: boolean
  adding: boolean
  onAdd: () => void
  label?: string
}

export default function AddToBacklogButton({ inBacklog, adding, onAdd, label = '+ Backlog' }: Props) {
  if (inBacklog) {
    return (
      <span className="shrink-0 text-xs font-medium px-3 py-1 rounded-md text-green-700 bg-green-50 border border-green-200 whitespace-nowrap">
        ✓ In backlog
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
