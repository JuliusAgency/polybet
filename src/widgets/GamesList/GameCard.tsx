import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Market, MarketOutcome } from '@/entities/market';
import type { GameTeam } from '@/entities/event';
import { formatVolume } from '@/shared/utils';
import type { WorldCupGame } from '@/features/bet';
import {
  toGameView,
  formatOddCents,
  readableTextColor,
  gameStatus,
  type MoneylineSlot,
} from './helpers';

export interface GameCardProps {
  game: WorldCupGame;
  onOutcomeClick: (market: Market, outcome: MarketOutcome) => void;
  selected?: { marketId: string; outcomeId: string } | null;
  /** Resolves an event id to its detail URL. Injected by the parent page so
   *  this widget does not import the app-layer route map (FSD). */
  buildEventHref: (eventId: string) => string;
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

// A single moneyline bet button (win / draw / loss). Takes the full button
// width with the outcome label and price side by side; reserves a fixed slot
// for the price so it never reflows on a refetch. `backgroundColor` is the team
// colour for win buttons (draw is neutral); selected buttons get an accent ring
// instead of a background swap since the background is already coloured.
function MoneylineButton({
  label,
  price,
  backgroundColor,
  color,
  active,
  disabled,
  onClick,
}: {
  label: string;
  price: number | null;
  backgroundColor: string;
  color: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-1 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor,
        color,
        border: '1px solid var(--color-border)',
        outline: active ? '2px solid var(--color-text-primary)' : 'none',
        outlineOffset: active ? '1px' : undefined,
      }}
    >
      <span className="truncate">{label}</span>
      <span className="font-mono tabular-nums">{formatOddCents(price)}</span>
    </button>
  );
}

function TeamRow({ team }: { team: GameTeam }) {
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

export function GameCard({ game, onOutcomeClick, selected, buildEventHref }: GameCardProps) {
  const { t, i18n } = useTranslation();
  const view = toGameView(game);
  const status = gameStatus(game);
  const isFinal = status === 'final';
  const kickoff = formatKickoff(game.event.game_start_time, i18n.language);
  const volumeLabel = formatVolume(game.event.volume ?? null);

  const isActive = (market: Market | null, outcome: MarketOutcome | null): boolean =>
    !!selected &&
    !!market &&
    !!outcome &&
    selected.marketId === market.id &&
    selected.outcomeId === outcome.id;

  // One win button per team, coloured with the team colour (accent fallback).
  const renderTeamButton = (slot: MoneylineSlot) => {
    const label = (slot.team.abbreviation ?? slot.team.name ?? '').toUpperCase();
    const key = slot.team.name ?? slot.team.abbreviation ?? label;
    if (!slot.market || !slot.outcome) {
      return (
        <MoneylineButton
          key={key}
          label={label || t('worldCup.noLine')}
          price={null}
          backgroundColor="var(--color-bg-elevated)"
          color="var(--color-text-muted)"
          active={false}
          disabled
          onClick={() => {}}
        />
      );
    }
    const market = slot.market;
    const outcome = slot.outcome;
    return (
      <MoneylineButton
        key={key}
        label={label}
        price={outcome.price}
        backgroundColor={slot.team.color || 'var(--color-accent)'}
        color={readableTextColor(slot.team.color)}
        active={isActive(market, outcome)}
        disabled={isFinal}
        onClick={() => onOutcomeClick(market, outcome)}
      />
    );
  };

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
          {status === 'live' && (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
              style={{ backgroundColor: 'var(--color-error)', color: 'var(--color-bg-base)' }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: 'currentColor' }}
              />
              {t('worldCup.live')}
            </span>
          )}
          {status === 'final' && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
              style={{
                backgroundColor: 'var(--color-bg-elevated)',
                color: 'var(--color-text-muted)',
              }}
            >
              {t('worldCup.final')}
            </span>
          )}
          {kickoff && <span className="font-medium">{kickoff}</span>}
          {volumeLabel && (
            <span className="font-mono">{t('markets.volumeShort', { value: volumeLabel })}</span>
          )}
        </div>
        <Link
          to={buildEventHref(game.event.id)}
          className="text-xs font-medium hover:underline"
          style={{ color: 'var(--color-accent)' }}
        >
          {t('worldCup.orderBook')}
        </Link>
      </div>

      {/* Team rows: flag + name + record, no price (prices live in the button row). */}
      <div className="mb-3 flex flex-col gap-2">
        {view.teams.map((team) => (
          <TeamRow key={team.name ?? team.abbreviation} team={team} />
        ))}
      </div>

      {/* Moneyline bet row: win / draw / loss. Home -> Draw -> Away (Polymarket). */}
      <div className="flex items-stretch gap-2">
        {view.teamSlots[0] && renderTeamButton(view.teamSlots[0])}
        {view.draw && (
          <MoneylineButton
            label={t('worldCup.draw')}
            price={view.draw.outcome.price}
            backgroundColor="var(--color-bg-elevated)"
            color="var(--color-text-primary)"
            active={isActive(view.draw.market, view.draw.outcome)}
            disabled={isFinal}
            onClick={() => onOutcomeClick(view.draw!.market, view.draw!.outcome)}
          />
        )}
        {view.teamSlots[1] && renderTeamButton(view.teamSlots[1])}
      </div>
    </div>
  );
}
