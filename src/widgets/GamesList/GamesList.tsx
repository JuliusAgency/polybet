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

export function GamesList({ games, isLoading, isError, onOutcomeClick, selected }: GamesListProps) {
  const { t, i18n } = useTranslation();

  if (isLoading) return <CardGridSkeleton count={6} />;

  if (isError) {
    return (
      <p className="py-12 text-center text-sm" style={{ color: 'var(--color-error)' }}>
        {t('worldCup.gamesError')}
      </p>
    );
  }

  if (games.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('worldCup.gamesEmpty')}
        </p>
      </div>
    );
  }

  const groups = groupGamesByDate(games);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
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
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
