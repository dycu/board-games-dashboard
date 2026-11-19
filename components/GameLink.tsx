import { Platform } from '@/lib/types'
import { bgaGamePanelUrl } from '@/lib/backlog/bgaSlug'

export const SMALL_BUTTON = 'text-xs font-medium px-2.5 py-1 rounded-md bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-muted-hover)] whitespace-nowrap'

// The game's own page: BGA's game panel, elsewhere the most recent table
export function playedGameUrl(g: { platform: Platform; gameUrl: string }): string {
  return (g.platform === 'bga' && bgaGamePanelUrl(g.gameUrl)) || g.gameUrl
}

export default function GameLink({ url, platform }: { url: string; platform: Platform }) {
  return (
    <a
      href={url}
      target={platform === 'bga' ? '_self' : '_blank'}
      rel="noopener noreferrer"
      title="Open the game's page"
      className={SMALL_BUTTON}
    >
      Game ↗
    </a>
  )
}
