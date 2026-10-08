import { Platform } from '@/lib/types'
import { bgaGamePanelUrl } from '@/lib/backlog/bgaSlug'

export const SMALL_BUTTON = 'text-xs font-medium px-2.5 py-1 rounded-md bg-[#f3f3f3] text-[#6b6b6b] border border-[#e5e5e5] hover:bg-[#ebebeb] whitespace-nowrap'

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
