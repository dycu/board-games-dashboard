'use client'
import { createContext, useContext } from 'react'
import { useOpponents } from '@/hooks/useOpponents'

type OpponentsValue = ReturnType<typeof useOpponents>

// Used whenever there's no OpponentsProvider above (component tests
// rendering GameCard/PlayerHoverCard in isolation, mainly) — the same
// shape as a page that hasn't loaded its data yet, so a PlayerHoverCard
// just renders without tags/response-time rather than throwing.
const NOT_LOADED: OpponentsValue = { byPlatform: null, error: null, saveTags: async () => {}, setHidden: async () => {}, reload: async () => {} }

const OpponentsContext = createContext<OpponentsValue>(NOT_LOADED)

// One /api/opponents fetch for the whole page, shared by anything that
// needs tags/avatar/response-time data — the Players page, and now
// PlayerHoverCard wherever a name is shown. Mounted once in app/layout.tsx
// so every page gets it without each caller (there can be dozens of
// PlayerHoverCards on one page) firing its own request.
export function OpponentsProvider({ children }: { children: React.ReactNode }) {
  const opponents = useOpponents()
  return <OpponentsContext.Provider value={opponents}>{children}</OpponentsContext.Provider>
}

export function useOpponentsContext(): OpponentsValue {
  return useContext(OpponentsContext)
}
