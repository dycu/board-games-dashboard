import Link from 'next/link'
import { Platform } from '@/lib/types'
import { gameHistoryHref } from '@/lib/gameStats'

// 🕘 to the game's history page, from any list that shows a game
export default function HistoryLink({ game, className = '' }: {
  game: { platform: Platform; gameName: string; gameType?: string; gameKey?: string }
  className?: string
}) {
  return (
    <Link
      href={gameHistoryHref(game)}
      aria-label={`Your history of ${game.gameType || game.gameName}`}
      title="Your history of this game"
      className={`relative z-10 shrink-0 text-xs text-[var(--icon-muted)] hover:text-[var(--accent)] ${className}`}>
      🕘
    </Link>
  )
}
