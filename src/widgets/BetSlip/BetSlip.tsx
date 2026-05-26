import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { Spinner } from '@/shared/ui/Spinner';
import { usePlaceBet, OddsDriftError, useBetQuote, useMyBetLimit } from '@/features/bet';
import type { BetQuote } from '@/features/bet';
import type { Market, MarketOutcome } from '@/entities/market';

export interface BetSlipProps {
  market: Market;
  outcome: MarketOutcome;
  availableBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}

// Match place_bet's c_odds_drift_tolerance (2%). Constants live in sync; if
// the backend tunes the threshold, mirror it here so the user doesn't get
// a silent server rejection after a passing client-side check.
const ODDS_DRIFT_TOLERANCE = 0.02;

const parseStake = (value: string): number | null => {
  // Reject anything that isn't a plain decimal number (no commas, no trailing chars)
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const n = Number(value);
  return isFinite(n) && n > 0 ? n : null;
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

  const { mutateAsync: placeBet, isPending } = usePlaceBet();

  const stake = parseStake(amount);
  const isValidStake = stake !== null;
  const isInsufficient = isValidStake && stake! > availableBalance;

  // Effective max bet limit (user > manager > global). null/0 means no limit.
  const { data: maxBetLimit } = useMyBetLimit();
  const hasBetLimit = maxBetLimit != null && maxBetLimit > 0;
  const isOverLimit = isValidStake && hasBetLimit && stake! > maxBetLimit!;

  // Live quote from the cached order book. The same RPC backs place_bet so
  // what the user sees is what gets locked in. Disabled until the user has
  // typed a valid affordable stake — otherwise we'd burn polling on noise.
  const quoteEnabled = isValidStake && !isInsufficient && Boolean(outcome.polymarket_token_id);
  const { data: quote, isFetching: quoteFetching } = useBetQuote({
    tokenId: outcome.polymarket_token_id,
    stake: isValidStake ? stake! : null,
    enabled: quoteEnabled,
  });

  // Polymarket parity (QA 2026-05-20 #2): payout must equal the number
  // Polymarket shows for the same stake. That means we ALWAYS use the live
  // order-book quote — the indicative mid-price formula (stake *
  // effective_odds) systematically overstates the payout because the real
  // ask sits above the mid by the bid-ask spread (~4% at sub-cent prices,
  // observable in QA: 85,123 vs 81,722 on a $100 stake).
  //
  // When the book is unavailable (CLOB unreachable or temporarily empty),
  // we surface "quote unavailable" and disable Confirm rather than show a
  // fabricated number. The server-side place_bet RPC still keeps its
  // indicative-odds fallback as a defence-in-depth for legacy clients.
  const bookAvailable = Boolean(quote && quote.book_updated_at !== null);
  const isQuoteReadyFromBook = Boolean(
    quote && bookAvailable && !quote.partial && quote.shares > 0
  );
  const isQuoteUnavailable = Boolean(quote && !bookAvailable);
  const effectiveShares =
    isValidStake && !isInsufficient && isQuoteReadyFromBook ? quote!.shares : null;
  const effectiveOddsForBet = isQuoteReadyFromBook ? quote!.effective_odds : null;
  const displayOdds = effectiveOddsForBet ?? outcome.effective_odds;

  const potentialPayout = effectiveShares;
  const balanceIfWin =
    effectiveShares !== null ? availableBalance - stake! + effectiveShares : null;
  const balanceIfLose = isValidStake && !isInsufficient ? availableBalance - stake! : null;

  const isUntradable = !outcome.polymarket_token_id;
  // Only treat as "low liquidity" when the book row exists and reports partial.
  // Missing-row case is handled by the indicative-odds fallback above.
  const isLowLiquidity = Boolean(
    quote && bookAvailable && quote.partial && stake !== null && stake > 0
  );
  const isQuoteLoading = quoteEnabled && !quote && !isUntradable;

  const handleAllIn = () => {
    setAmount(availableBalance.toFixed(2));
  };

  const handleConfirm = async () => {
    if (isPending) return;
    if (!isValidStake || isInsufficient || isOverLimit) return;
    if (isUntradable) {
      setSubmitError(t('markets.outcomeUntradable'));
      return;
    }
    // Polymarket parity: do not submit unless the live book quote is in hand.
    // Without it we'd lock odds against the optimistic mid-price formula and
    // overpay relative to what Polymarket would actually fill (~4% gap at
    // sub-cent prices).
    if (!quote || quote.book_updated_at === null) {
      setSubmitError(t('markets.quoteUnavailable'));
      return;
    }
    if (quote.partial || quote.shares <= 0) {
      setSubmitError(t('markets.lowLiquidity'));
      return;
    }

    // Pre-submit refetch of the live quote so locked_odds matches the most
    // recent book the user saw. Closes the race where bookWriter ticked
    // between BetSlip's last poll and Confirm click.
    setSubmitError(null);
    const roundedStake = Math.round(stake! * 100) / 100;
    const quoteKey = ['bet-quote', outcome.polymarket_token_id, roundedStake] as const;
    try {
      await queryClient.refetchQueries({ queryKey: quoteKey });
    } catch {
      // Fall back to the last known quote — the server-side guard catches
      // any actual staleness.
    }
    const fresh: BetQuote | null =
      queryClient.getQueryData<BetQuote | null>(quoteKey) ?? quote ?? null;

    // Polymarket parity: lock odds against the fresh book quote ONLY. If the
    // refresh dropped the quote (CLOB transient failure between debounce and
    // Confirm), abort and ask the user to retry — never lock at the
    // indicative-mid odds because that's exactly the gap QA flagged.
    const freshBookAvailable = Boolean(fresh && fresh.book_updated_at !== null);
    if (!fresh || !freshBookAvailable) {
      setSubmitError(t('markets.quoteUnavailable'));
      return;
    }
    if (fresh.partial || fresh.shares <= 0) {
      setSubmitError(t('markets.lowLiquidity'));
      return;
    }
    const lockOdds = fresh.effective_odds;

    if (lockOdds > 0 && displayOdds > 0) {
      const drift = Math.abs(lockOdds - displayOdds) / displayOdds;
      if (drift > ODDS_DRIFT_TOLERANCE) {
        setSubmitError(t('markets.oddsChanged', { odds: lockOdds.toFixed(2) }));
        return;
      }
    }

    try {
      await placeBet({
        marketId: market.id,
        outcomeId: outcome.id,
        stake: stake!,
        expectedOdds: lockOdds,
      });
      toast.success(
        t('bet.notification.placed', { outcome: outcome.name, stake: stake!.toFixed(2) }),
        { duration: 5000 }
      );
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof OddsDriftError) {
        setSubmitError(
          t('markets.oddsChanged', {
            odds: err.latestOdds !== null ? err.latestOdds.toFixed(2) : '—',
          })
        );
        return;
      }
      // Map raw server guard strings to friendly, actionable messages instead of
      // leaking the English Postgres exception. The staleness gates are an
      // antifraud bound (kept as-is server-side); here we just recover the UX by
      // refreshing the odds + book quote and telling the user to retry.
      const raw = err instanceof Error ? err.message : '';
      const isStale =
        raw.includes('Market price feed is stale') ||
        raw.includes('Market book is stale') ||
        raw.includes('Outcome price feed is stale');
      if (isStale) {
        setSubmitError(t('markets.priceStaleRetry'));
        void queryClient.refetchQueries({ queryKey: ['event'] });
        void queryClient.refetchQueries({ queryKey: quoteKey });
        return;
      }
      if (raw.includes('Insufficient liquidity')) {
        setSubmitError(t('markets.lowLiquidity'));
        return;
      }
      if (raw.includes('Stake exceeds effective maximum bet limit')) {
        setSubmitError(hasBetLimit ? t('markets.exceedsMaxBet', { amount: maxBetLimit }) : raw);
        return;
      }
      setSubmitError(raw || t('common.unknownError'));
    }
  };

  const isConfirmDisabled =
    !isValidStake ||
    isInsufficient ||
    isOverLimit ||
    isPending ||
    isUntradable ||
    isLowLiquidity ||
    isQuoteLoading ||
    isQuoteUnavailable ||
    effectiveShares === null;

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
              !isInsufficient && !isOverLimit
                ? t('markets.balance', { amount: availableBalance.toFixed(2) })
                : undefined
            }
            error={
              isInsufficient
                ? t('markets.insufficientBalance')
                : isOverLimit
                  ? t('markets.exceedsMaxBet', { amount: maxBetLimit })
                  : undefined
            }
            placeholder="0.00"
            disabled={isUntradable}
          />

          {hasBetLimit && (
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {t('markets.maxBet', { amount: maxBetLimit })}
            </p>
          )}

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

        {/* Low-liquidity warning: book depth ran out before stake was filled.
            Surface the max fillable stake so the user knows what they CAN bet. */}
        {isLowLiquidity && (
          <div
            className="rounded-lg border p-3 text-sm"
            style={{
              borderColor: 'var(--color-error)',
              color: 'var(--color-error)',
              backgroundColor: 'color-mix(in oklch, var(--color-error) 8%, var(--color-bg-base))',
            }}
          >
            {t('markets.lowLiquidity')}
            {quote && quote.available_stake != null && quote.available_stake > 0 && (
              <span className="mt-1 block font-medium">
                {t('markets.maxAvailableStake', { amount: quote.available_stake.toFixed(2) })}
              </span>
            )}
          </div>
        )}

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

        {/* Potential payout (gross — book quote shares, matches Polymarket "To win") */}
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
              {quoteFetching && (
                <span className="ms-2 inline-block align-middle">
                  <Spinner size="sm" />
                </span>
              )}
            </span>
          </div>
        )}

        {/* Book unavailable: surface an explicit warning so the user knows
            why Confirm is disabled. Polymarket parity demands we never lock
            against the optimistic indicative payout. */}
        {isQuoteUnavailable && !isQuoteLoading && (
          <div
            className="rounded-lg border p-3 text-sm"
            style={{
              borderColor: 'var(--color-error)',
              color: 'var(--color-error)',
              backgroundColor: 'color-mix(in oklch, var(--color-error) 8%, var(--color-bg-base))',
            }}
          >
            {t('markets.quoteUnavailable')}
          </div>
        )}

        {/* Quote is loading and we don't have a payout to render yet */}
        {isQuoteLoading && potentialPayout === null && (
          <div
            className="flex items-center gap-2 rounded-lg p-3 text-sm"
            style={{
              backgroundColor: 'var(--color-bg-base)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <Spinner size="sm" />
            {t('markets.quoteUpdating')}
          </div>
        )}

        {submitError && (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>
            {submitError}
          </p>
        )}

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
