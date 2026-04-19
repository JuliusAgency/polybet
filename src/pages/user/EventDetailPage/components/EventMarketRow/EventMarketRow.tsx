import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome, MyBet } from '@/features/bet';
import { Badge } from '@/shared/ui/Badge';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import {
  OutcomeProbabilityBar,
  type OutcomeProbabilityBarItem,
} from '@/shared/ui/OutcomeProbabilityBar';
import { formatVolume } from '@/shared/utils';

interface EventMarketRowProps {
  market: Market;
  userBet?: MyBet;
  mode?: 'interactive' | 'readonly';
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
  isFirst?: boolean;
}

function formatClosesDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(locale === 'he' ? 'he-IL' : undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const EventMarketRow = ({
  market,
  userBet,
  mode = 'interactive',
  onOutcomeClick,
  isFirst = false,
}: EventMarketRowProps) => {
  const { t, i18n } = useTranslation();

  const isExpired = market.close_at != null && new Date(market.close_at).getTime() <= Date.now();
  const effectiveStatus = isExpired && market.status === 'open' ? 'closed' : market.status;
  const isInteractive = mode === 'interactive' && effectiveStatus === 'open' && !isExpired;

  const winnerOutcome = market.winning_outcome_id
    ? (market.market_outcomes.find((o) => o.id === market.winning_outcome_id) ?? null)
    : null;

  const outcomeButtons: OutcomeButton[] = market.market_outcomes.map((o) => ({
    id: o.id,
    name: o.name,
    price: o.price,
    effectiveOdds: o.effective_odds,
    isWinner: winnerOutcome?.id === o.id,
  }));

  const probabilityItems: OutcomeProbabilityBarItem[] = market.market_outcomes.map((o) => ({
    id: o.id,
    name: o.name,
    price: o.price,
    isWinner: winnerOutcome?.id === o.id,
  }));

  const label = market.group_label ?? market.question;
  const volumeLabel = formatVolume(market.volume ?? null);
  const closesDate = formatClosesDate(market.close_at, i18n.language);
  const statusLabel =
    effectiveStatus !== 'open'
      ? t(`markets.status.${effectiveStatus}`, { defaultValue: effectiveStatus.toUpperCase() })
      : null;

  return (
    <div
      className="flex flex-col gap-2 px-3 py-3"
      style={{
        borderTop: isFirst ? undefined : '1px solid var(--color-border-subtle)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className="flex-1 text-sm font-medium leading-snug"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {label}
        </p>
        <div
          className="flex shrink-0 items-center gap-2 text-[11px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {volumeLabel && (
            <span className="font-mono">{t('markets.volumeShort', { value: volumeLabel })}</span>
          )}
          {statusLabel && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: `color-mix(in oklch, var(--color-${effectiveStatus === 'resolved' ? 'resolved' : 'text-secondary'}) 14%, transparent)`,
                color:
                  effectiveStatus === 'resolved'
                    ? 'var(--color-resolved)'
                    : 'var(--color-text-secondary)',
              }}
            >
              {statusLabel}
            </span>
          )}
        </div>
      </div>

      <OutcomeProbabilityBar outcomes={probabilityItems} />
      <OutcomeButtons
        outcomes={outcomeButtons}
        size="sm"
        disabled={!isInteractive}
        showPercentage={false}
        onClick={
          isInteractive && onOutcomeClick
            ? (outcomeId) => {
                const outcome = market.market_outcomes.find((o) => o.id === outcomeId);
                if (outcome) onOutcomeClick(market, outcome);
              }
            : undefined
        }
      />

      {(userBet || closesDate) && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {closesDate && (
            <span className="font-mono">
              {effectiveStatus === 'open' ? t('markets.closesAt') : t('markets.closedAt')}{' '}
              {closesDate}
            </span>
          )}
          {userBet && (
            <span className="flex items-center gap-1.5">
              <span>{t('markets.yourBet')}:</span>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                {userBet.market_outcomes?.name ?? '—'}
              </span>
              <span className="font-mono">{userBet.stake.toFixed(2)}</span>
              {userBet.status === 'open' && (
                <span className="font-mono" style={{ color: 'var(--color-accent)' }}>
                  → {userBet.potential_payout.toFixed(2)}
                </span>
              )}
              {userBet.status !== 'open' && (
                <Badge variant={userBet.status === 'won' ? 'win' : 'loss'}>
                  {userBet.status === 'won' ? t('bet.won') : t('bet.lost')}
                </Badge>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
