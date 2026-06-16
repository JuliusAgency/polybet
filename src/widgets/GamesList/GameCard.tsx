import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Market, MarketOutcome } from '@/entities/market';
import type { GameTeam } from '@/entities/event';
import { ROUTES, buildPath } from '@/app/router/routes';
import { formatVolume } from '@/shared/utils';
import type { WorldCupGame } from '@/features/bet';
import { toGameView, formatOddCents, type MoneylineSlot } from './helpers';

export interface GameCardProps {
  game: WorldCupGame;
  onOutcomeClick: (market: Market, outcome: MarketOutcome) => void;
  selected?: { marketId: string; outcomeId: string } | null;
}

function localeOf(lang: string): string {
  return lang === 'he' ? 'he-IL' : 'en-US';
}

function formatKickoff(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(localeOf(lang), { hour: 'numeric', minute: '2-digit' }).format(d);
}

// A single price chip (team / draw / spread / total). Reserves a fixed slot so
// the price never reflows; highlights when its BetSlip is open.
function OddChip({
  label,
  price,
  active,
  disabled,
  onClick,
}: {
  label: string;
  price: number | null;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-w-[5.5rem] items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: active ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
        color: active ? 'var(--color-bg-base)' : 'var(--color-text-primary)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span className="truncate">{label}</span>
      <span className="font-mono tabular-nums">{formatOddCents(price)}</span>
    </button>
  );
}

function TeamCell({ team }: { team: GameTeam }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {team.logo ? (
        <img
          src={team.logo}
          alt=""
          width={24}
          height={24}
          loading="lazy"
          className="h-6 w-6 rounded-sm object-cover"
        />
      ) : (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-sm text-[10px] font-bold uppercase"
          style={{
            backgroundColor: 'var(--color-bg-elevated)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {(team.abbreviation ?? team.name ?? '?').slice(0, 3)}
        </span>
      )}
      <span className="truncate font-medium" style={{ color: 'var(--color-text-primary)' }}>
        {team.name ?? team.abbreviation ?? '—'}
      </span>
      {team.record && (
        <span className="shrink-0 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {team.record}
        </span>
      )}
    </div>
  );
}

export function GameCard({ game, onOutcomeClick, selected }: GameCardProps) {
  const { t, i18n } = useTranslation();
  const view = toGameView(game);
  const kickoff = formatKickoff(game.event.game_start_time, i18n.language);
  const volumeLabel = formatVolume(game.event.volume ?? null);

  const isActive = (market: Market | null, outcome: MarketOutcome | null): boolean =>
    !!selected &&
    !!market &&
    !!outcome &&
    selected.marketId === market.id &&
    selected.outcomeId === outcome.id;

  const renderSlot = (slot: MoneylineSlot) => (
    <div
      key={slot.team.name ?? slot.team.abbreviation}
      className="flex items-center justify-between gap-3"
    >
      <TeamCell team={slot.team} />
      {slot.market && slot.outcome ? (
        <OddChip
          label={(slot.team.abbreviation ?? slot.team.name ?? '').toUpperCase()}
          price={slot.outcome.price}
          active={isActive(slot.market, slot.outcome)}
          disabled={false}
          onClick={() => onOutcomeClick(slot.market as Market, slot.outcome as MarketOutcome)}
        />
      ) : (
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('worldCup.noLine')}
        </span>
      )}
    </div>
  );

  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Header: kickoff time + volume + Order Book link */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 text-xs"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {kickoff && <span className="font-medium">{kickoff}</span>}
          {volumeLabel && (
            <span className="font-mono">{t('markets.volumeShort', { value: volumeLabel })}</span>
          )}
        </div>
        <Link
          to={buildPath(ROUTES.USER.EVENT_DETAIL, { id: game.event.id })}
          className="text-xs font-medium hover:underline"
          style={{ color: 'var(--color-accent)' }}
        >
          {t('worldCup.orderBook')}
        </Link>
      </div>

      {/* Moneyline: team rows with a draw chip between them (3-way games). */}
      <div className="flex flex-col gap-2">
        {view.teamSlots[0] && renderSlot(view.teamSlots[0])}
        {view.draw && (
          <div className="flex items-center justify-end">
            <OddChip
              label={t('worldCup.draw')}
              price={view.draw.outcome.price}
              active={isActive(view.draw.market, view.draw.outcome)}
              disabled={false}
              onClick={() => onOutcomeClick(view.draw!.market, view.draw!.outcome)}
            />
          </div>
        )}
        {view.teamSlots[1] && renderSlot(view.teamSlots[1])}
      </div>

      {/* Spread / Total — rendered only when upstream provides them (other
          sports). Football World Cup ships moneyline only today. */}
      {(game.spread.length > 0 || game.total.length > 0) && (
        <div
          className="mt-3 flex flex-col gap-3 border-t pt-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {game.spread.length > 0 && (
            <MarketTypeRow
              title={t('worldCup.spread')}
              markets={game.spread}
              onOutcomeClick={onOutcomeClick}
              selected={selected}
            />
          )}
          {game.total.length > 0 && (
            <MarketTypeRow
              title={t('worldCup.total')}
              markets={game.total}
              onOutcomeClick={onOutcomeClick}
              selected={selected}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Generic row for spread / total markets: one chip per market (group_label +
// line) bound to its Yes outcome. Kept generic since exact home/away pairing
// varies by sport.
function MarketTypeRow({
  title,
  markets,
  onOutcomeClick,
  selected,
}: {
  title: string;
  markets: Market[];
  onOutcomeClick: (market: Market, outcome: MarketOutcome) => void;
  selected?: { marketId: string; outcomeId: string } | null;
}) {
  return (
    <div>
      <p
        className="mb-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {markets.map((market) => {
          const outcome =
            market.market_outcomes?.find((o) => o.name.trim().toLowerCase() === 'yes') ??
            market.market_outcomes?.[0] ??
            null;
          if (!outcome) return null;
          const label = [market.group_label, market.line != null ? market.line : null]
            .filter((v) => v != null && v !== '')
            .join(' ');
          const active =
            !!selected && selected.marketId === market.id && selected.outcomeId === outcome.id;
          return (
            <OddChip
              key={market.id}
              label={label || market.question}
              price={outcome.price}
              active={active}
              disabled={false}
              onClick={() => onOutcomeClick(market, outcome)}
            />
          );
        })}
      </div>
    </div>
  );
}
