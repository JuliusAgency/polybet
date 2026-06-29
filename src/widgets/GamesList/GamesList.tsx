import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome } from '@/entities/market';
import type { WorldCupGame } from '@/features/bet';
import { CardGridSkeleton } from '@/shared/ui/CardGridSkeleton';
import { GameCard } from './GameCard';
import { groupGamesByDate } from './helpers';

export interface GamesListProps {
  games: WorldCupGame[];
  isLoading: boolean;
  isError: boolean;
  onOutcomeClick: (market: Market, outcome: MarketOutcome) => void;
  selected?: { marketId: string; outcomeId: string } | null;
  /** Resolves an event id to its detail URL; threaded down to each GameCard. */
  buildEventHref: (eventId: string) => string;
  /** Whether recently-finished games are currently included in `games`. */
  showFinished?: boolean;
  /** Toggle finished games. When omitted, the "View finished" control is hidden
   *  (e.g. in unit tests that render a static games list). */
  onToggleFinished?: () => void;
}

function localeOf(lang: string): string {
  return lang === 'he' ? 'he-IL' : 'en-US';
}

function formatDayHeader(group: { games: WorldCupGame[] }, lang: string): string {
  const iso = group.games[0]?.event.game_start_time;
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(localeOf(lang), {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

export function GamesList({
  games,
  isLoading,
  isError,
  onOutcomeClick,
  selected,
  buildEventHref,
  showFinished = false,
  onToggleFinished,
}: GamesListProps) {
  const { t, i18n } = useTranslation();

  if (isLoading) return <CardGridSkeleton count={6} />;

  if (isError) {
    return (
      <p className="py-12 text-center text-sm" style={{ color: 'var(--color-error)' }}>
        {t('worldCup.gamesError')}
      </p>
    );
  }

  const groups = groupGamesByDate(games);

  // The "View finished" control loads recently-played games on demand
  // (Polymarket parity). Rendered only when the parent wires a toggle handler.
  const finishedToggle = onToggleFinished ? (
    <div className="flex justify-center pt-2">
      <button
        type="button"
        onClick={onToggleFinished}
        className="text-sm font-medium hover:underline"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {showFinished ? t('worldCup.hideFinished') : t('worldCup.viewFinished')}
      </button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {games.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('worldCup.gamesEmpty')}
          </p>
        </div>
      ) : (
        groups.map((group) => {
          const header = formatDayHeader(group, i18n.language) || t('worldCup.gamesScheduled');
          return (
            <section key={group.key || 'scheduled'}>
              <h2 className="mb-3 text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {header}
              </h2>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {group.games.map((game) => (
                  <GameCard
                    key={game.event.id}
                    game={game}
                    onOutcomeClick={onOutcomeClick}
                    selected={selected}
                    buildEventHref={buildEventHref}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
      {finishedToggle}
    </div>
  );
}
