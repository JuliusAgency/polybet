import { useTranslation } from 'react-i18next';
import type { Market, MarketOutcome, MyBet } from '@/features/bet';
import { Badge } from '@/shared/ui/Badge';
import { BookmarkButton } from '@/shared/ui/BookmarkButton';
import { BetMarker } from '@/shared/ui/BetMarker';
import { MarketThumbnail } from '@/shared/ui/MarketThumbnail';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import { formatVolume } from '@/shared/utils';

interface EventMarketRowProps {
  market: Market;
  userBet?: MyBet;
  mode?: 'interactive' | 'readonly';
  onOutcomeClick?: (market: Market, outcome: MarketOutcome) => void;
  isFirst?: boolean;
}

export const EventMarketRow = ({
  market,
  userBet,
  mode = 'interactive',
  onOutcomeClick,
  isFirst = false,
}: EventMarketRowProps) => {
  const { t, i18n } = useTranslation();
  const isHebrew = i18n.language === 'he';

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

  const label = market.group_label ?? market.question;
  const volumeLabel = formatVolume(market.volume ?? null);
  const yesOutcome = market.market_outcomes[0];
  const yesPct = yesOutcome?.price != null ? `${Math.round(yesOutcome.price * 100)}%` : null;

  const statusLabel =
    effectiveStatus !== 'open'
      ? t(`markets.status.${effectiveStatus}`, { defaultValue: effectiveStatus.toUpperCase() })
      : null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{
        borderTop: isFirst ? undefined : '1px solid var(--color-border-subtle)',
      }}
    >
      <MarketThumbnail src={market.image_url} title={label} id={market.id} size="sm" />

      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-semibold"
          style={{
            color: 'var(--color-text-primary)',
            ...(isHebrew && { direction: 'ltr' as const, textAlign: 'right' as const }),
          }}
        >
          {label}
        </p>
        <div
          className="mt-0.5 flex items-center gap-2 text-[11px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {volumeLabel && (
            <span className="font-mono">{t('markets.volumeShort', { value: volumeLabel })}</span>
          )}
          {userBet && (
            <span className="flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
              <span>{t('markets.yourBet')}:</span>
              <span style={{ fontWeight: 600 }}>{userBet.market_outcomes?.name ?? '—'}</span>
              <span className="font-mono">{userBet.stake.toFixed(2)}</span>
              {userBet.status !== 'open' && (
                <Badge variant={userBet.status === 'won' ? 'win' : 'loss'}>
                  {userBet.status === 'won' ? t('bet.won') : t('bet.lost')}
                </Badge>
              )}
            </span>
          )}
          {statusLabel && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isHebrew ? '' : 'uppercase tracking-wide'
              }`}
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

      {yesPct && (
        <div className="shrink-0 ps-4 pe-6 text-center">
          <div
            className="text-lg font-bold tabular-nums"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {yesPct}
          </div>
        </div>
      )}

      <div className="w-[320px] shrink-0">
        <OutcomeButtons
          outcomes={outcomeButtons}
          size="sm"
          disabled={!isInteractive}
          showPercentage
          priceFormat="cents"
          ctaLabel={t('markets.buy', { defaultValue: 'Buy' })}
          onClick={
            isInteractive && onOutcomeClick
              ? (outcomeId) => {
                  const outcome = market.market_outcomes.find((o) => o.id === outcomeId);
                  if (outcome) onOutcomeClick(market, outcome);
                }
              : undefined
          }
        />
      </div>

      {userBet && <BetMarker />}
      <BookmarkButton marketId={market.id} stopPropagation />
    </div>
  );
};
