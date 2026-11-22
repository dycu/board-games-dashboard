'use client'
import { createContext, useContext } from 'react'
import { useGameTags } from '@/hooks/useGameTags'

type GameTagsValue = ReturnType<typeof useGameTags>

// Used whenever there's no GameTagsProvider above (component tests
// rendering GameCard/FinishedGameCard in isolation, mainly) — the same
// shape as a page that hasn't loaded its data yet, so a badge or filter
// just renders without tags rather than throwing.
const NOT_LOADED: GameTagsValue = { byPlatform: null, error: null, saveTags: async () => {}, reload: async () => {} }

const GameTagsContext = createContext<GameTagsValue>(NOT_LOADED)

// One /api/game-tags fetch for the whole page, shared by anything that
// needs to read tags (a badge on a card, a filter chip row) or — only on
// the History game page — add/remove one. Mounted once in app/layout.tsx
// so every page gets it without each caller firing its own request.
export function GameTagsProvider({ children }: { children: React.ReactNode }) {
  const gameTags = useGameTags()
  return <GameTagsContext.Provider value={gameTags}>{children}</GameTagsContext.Provider>
}

export function useGameTagsContext(): GameTagsValue {
  return useContext(GameTagsContext)
}
