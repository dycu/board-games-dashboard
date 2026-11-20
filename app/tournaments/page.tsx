'use client'
import { useTournaments } from '@/hooks/useTournaments'
import { Tournament, PLATFORM_LABELS, PLATFORM_SHORT_LABELS } from '@/lib/types'
import { BADGE_COLORS } from '@/lib/platform-colors'
import TopNav from '@/components/TopNav'

const BADGE_FALLBACK = 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'

function PlatformBadge({ tournament }: { tournament: Tournament }) {
  return (
    <span title={PLATFORM_LABELS[tournament.platform]} className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BADGE_COLORS[tournament.platform] ?? BADGE_FALLBACK}`}>
      {PLATFORM_SHORT_LABELS[tournament.platform]}
    </span>
  )
}

// BGA's own status strings, as close to plain language as they get without
// pretending to know every one the site can send — anything unrecognized
// just shows as-is instead of a blank.
const STATUS_LABELS: Record<string, string> = {
  register: 'Registration open',
  playing: 'In progress',
  running: 'In progress',
  finished: 'Finished',
}

function TournamentCard({ tournament: t }: { tournament: Tournament }) {
  const statusLabel = STATUS_LABELS[t.status] ?? t.status
  const finished = t.status === 'finished'
  return (
    <div id={t.id} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex flex-col gap-2 scroll-mt-20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PlatformBadge tournament={t} />
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${finished ? 'bg-[var(--bg-muted)] text-[var(--text-secondary)]' : 'bg-green-100 text-green-700'}`}>
            {statusLabel}
          </span>
        </div>
        <a
          href={t.tournamentUrl}
          target={t.platform === 'bga' ? '_self' : '_blank'}
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
        >
          View on {PLATFORM_LABELS[t.platform]} ↗
        </a>
      </div>

      <div>
        <div className="font-semibold text-sm text-[var(--text-primary)]">{t.name}</div>
        {t.championshipName && t.championshipName !== t.name && (
          <div className="text-xs text-[var(--text-tertiary)]">{t.championshipName}</div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
        <span>{t.typeLabel}</span>
        {t.gameName && <span>{t.gameName}</span>}
        {t.registeredPlayers != null && (
          <span>{t.registeredPlayers}{t.remainingPlayers != null ? ` players · ${t.remainingPlayers} remaining` : ' players'}</span>
        )}
        {t.encountersPlayed > 0 && <span>{t.encountersWon}/{t.encountersPlayed} matches won</span>}
        {t.myStatus && <span className="capitalize">{t.myStatus}</span>}
      </div>

      {t.progress != null && (
        <div className="h-1.5 rounded-full bg-[var(--bg-muted)] overflow-hidden">
          <div
            className={`h-full rounded-full ${finished ? 'bg-[var(--text-tertiary)]' : 'bg-[var(--accent)]'}`}
            style={{ width: `${Math.round(Math.min(1, Math.max(0, t.progress)) * 100)}%` }}
          />
        </div>
      )}

      {t.activeTableId && (
        <a
          href={`https://boardgamearena.com/table?table=${t.activeTableId}`}
          target={t.platform === 'bga' ? '_self' : '_blank'}
          rel="noopener noreferrer"
          className="self-start text-xs font-medium px-3 py-1 rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
        >
          Open your current match ▶
        </a>
      )}
    </div>
  )
}

export default function TournamentsPage() {
  const { tournaments, isLoading, error } = useTournaments()
  const active = tournaments.filter(t => t.status !== 'finished')
  const finished = tournaments.filter(t => t.status === 'finished')

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav />
      <div className="flex-1 overflow-y-auto px-5 py-5 max-w-3xl w-full mx-auto">
        {error && (
          <div className="mb-4 text-xs bg-red-100 text-red-600 px-3 py-2 rounded-md">⚠ {error}</div>
        )}

        {isLoading && tournaments.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">Loading…</p>
        ) : tournaments.length === 0 ? (
          <div className="text-sm text-[var(--text-tertiary)]">
            No tournaments found. Only Board Game Arena tournaments are tracked today.
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <section className="mb-7">
                <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)] mb-2">
                  Active · {active.length}
                </p>
                <div className="flex flex-col gap-2.5">
                  {active.map(t => <TournamentCard key={t.id} tournament={t} />)}
                </div>
              </section>
            )}
            {finished.length > 0 && (
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-tertiary)] mb-2">
                  Finished · {finished.length}
                </p>
                <div className="flex flex-col gap-2.5">
                  {finished.map(t => <TournamentCard key={t.id} tournament={t} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
