import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { usePlaceBet, OddsDriftError } from '@/features/bet';
import type { Market, MarketOutcome } from '@/entities/market';
import { MIN_TRADABLE_PRICE, isOutcomeTradable } from '@/entities/market';
import type { EventWithMarkets } from '@/features/bet';

export interface BetSlipProps {
  market: Market;
  outcome: MarketOutcome;
  availableBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}

// Match the backend's odds_drift_tolerance from
// 20260514091027_place_bet_hard_guards.sql. Constants live in sync; if the
// backend tunes the threshold, mirror it here so the user does not get a
// silent server rejection after a passing client-side check.
const ODDS_DRIFT_TOLERANCE = 0.02;

const getDisplayOdds = (source: Pick<MarketOutcome, 'price' | 'effective_odds'>): number => {
  if (source.price != null && Number.isFinite(source.price) && source.price > 0 && source.price <= 1) {
    return 1 / Math.max(MIN_TRADABLE_PRICE, source.price);
  }
  return source.effective_odds;
};

const parseStake = (value: string): number | null => {
  // Reject anything that isn't a plain decimal number (no commas, no trailing chars)
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const n = Number(value);
  return isFinite(n) && n > 0 ? n : null;
};

const getLiveOutcome = (
  queryClient: ReturnType<typeof useQueryClient>,
  market: Market,
  outcomeId: string
): MarketOutcome | null => {
  const eventData = queryClient.getQueryData<EventWithMarkets>(['event', market.event_id]);
  if (!eventData) return null;
  const liveMarket = eventData.markets.find((m) => m.id === market.id);
  if (!liveMarket) return null;
  return liveMarket.market_outcomes?.find((o) => o.id === outcomeId) ?? null;
};

export const BetSlip = ({
  market,
  outcome,
  availableBalance,
  onClose,
  onSuccess,
}: BetSlipProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  // displayOdds is the price the user has acknowledged. Starts at the value
  // that opened the slip; can be replaced by a drift detection so the user
  // sees the corrected number before submitting.
  const [displayOdds, setDisplayOdds] = useState(getDisplayOdds(outcome));

  const { mutateAsync: placeBet, isPending } = usePlaceBet();

  // Re-check tradability against the live cache so a 30s-stale parent screen
  // can't keep the slip clickable after the market has gone illiquid. This
  // is a UX gate; the authoritative check is in the place_bet RPC.
  const liveOutcome = getLiveOutcome(queryClient, market, outcome.id);
  const effectivePrice = liveOutcome?.price ?? outcome.price;
  const isUntradable = !isOutcomeTradable(effectivePrice);

  const stake = parseStake(amount);
  const isValidStake = stake !== null;
  const isInsufficient = isValidStake && stake! > availableBalance;
  const potentialPayout = isValidStake && !isInsufficient ? stake! * (displayOdds - 1) : null;
  const balanceIfWin =
    isValidStake && !isInsufficient ? availableBalance - stake! + stake! * displayOdds : null;
  const balanceIfLose = isValidStake && !isInsufficient ? availableBalance - stake! : null;

  const handleAllIn = () => {
    setAmount(availableBalance.toFixed(2));
  };

  const handleConfirm = async () => {
    if (isPending) return;
    if (!isValidStake || isInsufficient) return;
    if (isUntradable) {
      setSubmitError(t('markets.outcomeUntradable'));
      return;
    }

    // Pre-submit refresh: force-fetch the latest event so the cache reflects
    // server-side prices, not the 30s-stale snapshot. Closes the race where
    // refresh-markets ticked between BetSlip mount and Confirm click.
    setSubmitError(null);
    try {
      await queryClient.refetchQueries({ queryKey: ['event', market.event_id] });
    } catch {
      // Ignore — the server-side guard still protects us if cache is stale.
    }

    const fresh = getLiveOutcome(queryClient, market, outcome.id);
    if (fresh && fresh.price !== null && !isOutcomeTradable(fresh.price)) {
      setSubmitError(t('markets.outcomeUntradable'));
      setDisplayOdds(getDisplayOdds(fresh));
      return;
    }

    if (fresh) {
      const nextDisplayOdds = getDisplayOdds(fresh);
      if (nextDisplayOdds <= 0) {
        setSubmitError(t('common.unknownError'));
        return;
      }
      const drift = Math.abs(nextDisplayOdds - displayOdds) / displayOdds;
      if (drift > ODDS_DRIFT_TOLERANCE) {
        // Surface the new number and require a second click. We do NOT
        // submit on this pass — the user must explicitly accept the moved
        // odds to prevent silent price-change surprises.
        setDisplayOdds(nextDisplayOdds);
        setSubmitError(t('markets.oddsChanged', { odds: nextDisplayOdds.toFixed(2) }));
        return;
      }
    }

    try {
      await placeBet({
        marketId: market.id,
        outcomeId: outcome.id,
        stake: stake!,
        expectedOdds: displayOdds,
      });
      toast.success(
        t('bet.notification.placed', { outcome: outcome.name, stake: stake!.toFixed(2) }),
        { duration: 5000 }
      );
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof OddsDriftError) {
        if (err.latestOdds !== null) setDisplayOdds(err.latestOdds);
        setSubmitError(
          t('markets.oddsChanged', {
            odds: err.latestOdds !== null ? err.latestOdds.toFixed(2) : '—',
          })
        );
        return;
      }
      setSubmitError(err instanceof Error ? err.message : t('common.unknownError'));
    }
  };

  const isConfirmDisabled = !isValidStake || isInsufficient || isPending || isUntradable;

  return (
    <Modal isOpen onClose={onClose} title={t('markets.betSlipTitle')}>
      <div className="flex flex-col gap-4">
        {/* Market question */}
        <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-bg-base)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {market.question}
          </p>
        </div>

        {/* Selected outcome */}
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {outcome.name}
          </span>
          <Badge variant="open">{displayOdds.toFixed(2)}</Badge>
        </div>

        {/* Untradable: prominent block above the stake input so the user
            sees it before bothering to enter an amount. */}
        {isUntradable && (
          <div
            className="rounded-lg border p-3 text-sm"
            style={{
              borderColor: 'var(--color-error)',
              color: 'var(--color-error)',
              backgroundColor: 'color-mix(in oklch, var(--color-error) 8%, var(--color-bg-base))',
            }}
          >
            {t('markets.outcomeUntradable')}
          </div>
        )}

        {/* Stake input */}
        <div className="flex flex-col gap-2">
          <Input
            label={t('markets.stakeLabel')}
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint={
              !isInsufficient
                ? t('markets.balance', { amount: availableBalance.toFixed(2) })
                : undefined
            }
            error={isInsufficient ? t('markets.insufficientBalance') : undefined}
            placeholder="0.00"
            disabled={isUntradable}
          />

          {/* All In button */}
          <Button
            variant="secondary"
            onClick={handleAllIn}
            type="button"
            className="self-start text-sm"
            disabled={isUntradable}
          >
            {t('markets.allIn')}
          </Button>
        </div>

        {/* Balance preview after bet */}
        {balanceIfWin !== null && balanceIfLose !== null && (
          <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-bg-base)' }}>
            <p
              className="mb-2 text-xs font-medium"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t('markets.afterBet')}
            </p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {t('markets.afterBetIfWin')}
                </span>
                <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  <span style={{ color: 'var(--color-win)' }}>{balanceIfWin.toFixed(2)}</span>
                  <span className="mx-1 font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    ←
                  </span>
                  <span style={{ color: 'var(--color-text-primary)' }}>
                    {availableBalance.toFixed(2)}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {t('markets.afterBetIfLose')}
                </span>
                <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  <span style={{ color: 'var(--color-error)' }}>{balanceIfLose.toFixed(2)}</span>
                  <span className="mx-1 font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    ←
                  </span>
                  <span style={{ color: 'var(--color-text-primary)' }}>
                    {availableBalance.toFixed(2)}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Potential payout */}
        {potentialPayout !== null && (
          <div
            className="flex items-center justify-between rounded-lg p-3"
            style={{ backgroundColor: 'var(--color-bg-base)' }}
          >
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('markets.potentialPayout')}
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-win)' }}>
              {potentialPayout.toFixed(2)}
            </span>
          </div>
        )}

        {/* Submit error (also reused for the drift-retry copy) */}
        {submitError && (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>
            {submitError}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="flex-1"
          >
            {isPending ? t('common.saving') : t('markets.confirmBet')}
          </Button>
          <Button variant="secondary" onClick={onClose} type="button">
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
