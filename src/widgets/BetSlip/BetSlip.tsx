import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import { usePlaceBet, OddsDriftError, useBetQuote, useMyBetLimit } from '@/features/bet';
import type { BetQuote } from '@/features/bet';
import { getOrderedOutcomes, type Market, type MarketOutcome } from '@/entities/market';
import { formatSharePrice } from '@/shared/utils';

// Polymarket-style quick-add chips for the stake input (matches the reference
// BetSlip). Buying is always denominated in dollars; shares are derived.
const QUICK_ADD_AMOUNTS = [1, 5, 10, 100] as const;

export interface BetSlipProps {
  market: Market;
  /** Initially-selected outcome. The slip lets the user switch sides among
   *  `market.market_outcomes` without reopening. */
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

  // Single source of truth for which side we're buying. Everything downstream
  // (quote token, price, shares, drift, place_bet payload) derives from
  // `selected` — never from the original `outcome` prop — so switching sides
  // can never leave a stale token/outcome that would buy the wrong side.
  const [selectedOutcomeId, setSelectedOutcomeId] = useState(outcome.id);
  const selected = useMemo(
    () => market.market_outcomes.find((o) => o.id === selectedOutcomeId) ?? outcome,
    [market.market_outcomes, selectedOutcomeId, outcome]
  );

  // Canonical [Yes, No] order for the in-slip side selector.
  const outcomeButtons: OutcomeButton[] = useMemo(
    () =>
      getOrderedOutcomes(market).map((o) => ({
        id: o.id,
        name: o.name,
        price: o.price,
        effectiveOdds: o.effective_odds,
        untradable: !o.polymarket_token_id,
      })),
    [market]
  );

  const { mutateAsync: placeBet, isPending } = usePlaceBet();

  const stake = parseStake(amount);
  const isValidStake = stake !== null;
  const isInsufficient = isValidStake && stake! > availableBalance;

  // Effective max bet limit (user > manager > global). null/0 means no limit.
  const { data: maxBetLimit } = useMyBetLimit();
  const hasBetLimit = maxBetLimit != null && maxBetLimit > 0;
  const isOverLimit = isValidStake && hasBetLimit && stake! > maxBetLimit!;

  // Live quote from the cached order book. Keyed on the SELECTED outcome's
  // token, so switching sides automatically refetches the right book. The same
  // RPC backs place_bet so what the user sees is what gets locked in.
  const quoteEnabled = isValidStake && !isInsufficient && Boolean(selected.polymarket_token_id);
  const { data: quote, isFetching: quoteFetching } = useBetQuote({
    tokenId: selected.polymarket_token_id,
    stake: isValidStake ? stake! : null,
    enabled: quoteEnabled,
  });

  // Shares model: the user buys shares at the order-book fill price; each
  // winning share pays $1, so "to win" == shares. We ALWAYS use the live
  // order-book quote — the server's place_bet REQUIRES a fresh book and has no
  // mid-price fallback, so if the book is unavailable we surface "quote
  // unavailable" and disable the CTA rather than show a fabricated number.
  const bookAvailable = Boolean(quote && quote.book_updated_at !== null);
  const isQuoteReadyFromBook = Boolean(
    quote && bookAvailable && !quote.partial && quote.shares > 0
  );
  const isQuoteUnavailable = Boolean(quote && !bookAvailable);
  const effectiveShares =
    isValidStake && !isInsufficient && isQuoteReadyFromBook ? quote!.shares : null;
  const effectiveOddsForBet = isQuoteReadyFromBook ? quote!.effective_odds : null;
  const displayOdds = effectiveOddsForBet ?? selected.effective_odds;
  // Share price for the chip / "Avg. Price" line, in cents. Prefer the
  // book-derived average fill price; fall back to the indicative outcome price
  // purely for display before the first quote lands.
  const displayPrice =
    isQuoteReadyFromBook && quote!.avg_price > 0 ? quote!.avg_price : selected.price;

  // "To win": gross shares (each pays $1). Profit = shares - stake.
  const toWin = effectiveShares;
  const profitIfWin = effectiveShares !== null ? effectiveShares - stake! : null;
  const balanceIfWin =
    effectiveShares !== null ? availableBalance - stake! + effectiveShares : null;
  const balanceIfLose = isValidStake && !isInsufficient ? availableBalance - stake! : null;

  const isUntradable = !selected.polymarket_token_id;
  // Only treat as "low liquidity" when the book row exists and reports partial.
  const isLowLiquidity = Boolean(
    quote && bookAvailable && quote.partial && stake !== null && stake > 0
  );
  const isQuoteLoading = quoteEnabled && !quote && !isUntradable;

  const handleSelectOutcome = (id: string) => {
    setSelectedOutcomeId(id);
    setSubmitError(null);
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    setSubmitError(null);
  };

  const handleAllIn = () => {
    handleAmountChange(availableBalance.toFixed(2));
  };

  const handleConfirm = async () => {
    if (isPending) return;
    if (!isValidStake || isInsufficient || isOverLimit) return;
    if (isUntradable) {
      setSubmitError(t('markets.outcomeUntradable'));
      return;
    }
    // Shares model: do not submit unless the live book quote is in hand. The
    // server rejects with "Market book unavailable" when there is no fresh
    // book, so a client-side guard here avoids a pointless round-trip.
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
    const quoteKey = ['bet-quote', selected.polymarket_token_id, roundedStake] as const;
    try {
      await queryClient.refetchQueries({ queryKey: quoteKey });
    } catch {
      // Fall back to the last known quote — the server-side guard catches
      // any actual staleness.
    }
    const fresh: BetQuote | null =
      queryClient.getQueryData<BetQuote | null>(quoteKey) ?? quote ?? null;

    // Lock the price against the fresh book quote ONLY. If the refresh dropped
    // the quote (CLOB transient failure between debounce and Confirm), abort
    // and ask the user to retry — the server has no mid-price fallback and
    // would reject the bet anyway.
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
        outcomeId: selected.id,
        stake: stake!,
        expectedOdds: lockOdds,
      });
      toast.success(
        t('bet.notification.placed', { outcome: selected.name, stake: stake!.toFixed(2) }),
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
      // leaking the English Postgres exception.
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

  const warningBoxStyle = {
    borderColor: 'var(--color-error)',
    color: 'var(--color-error)',
    backgroundColor: 'color-mix(in oklch, var(--color-error) 8%, var(--color-bg-base))',
  } as const;

  return (
    <Modal isOpen onClose={onClose} title={t('markets.betSlipTitle')}>
      <div className="flex flex-col gap-4">
        {/* Market question — light, informational */}
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {market.question}
        </p>

        {/* Outcome side selector (Yes / No), price shown in cents */}
        <OutcomeButtons
          outcomes={outcomeButtons}
          size="xl"
          priceFormat="cents"
          selectedId={selectedOutcomeId}
          onClick={handleSelectOutcome}
        />

        {isUntradable && (
          <div className="rounded-lg border p-3 text-sm" style={warningBoxStyle}>
            {t('markets.outcomeUntradable')}
          </div>
        )}

        {/* Amount — large Polymarket-style display. The number lives on its own
            full-width row so it never competes with the label and cannot
            overflow the card (incl. long balances in RTL). */}
        <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-bg-base)' }}>
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="betslip-amount"
              className="text-sm font-medium"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t('markets.stakeLabel')}
            </label>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('markets.balance', { amount: availableBalance.toFixed(2) })}
            </span>
          </div>

          <div className="mt-2 flex items-baseline gap-1">
            <span
              className="shrink-0 text-2xl font-bold"
              style={{ color: amount ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
            >
              $
            </span>
            <input
              id="betslip-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0"
              disabled={isUntradable}
              aria-label={t('markets.stakeLabel')}
              className="w-full min-w-0 flex-1 bg-transparent text-end text-3xl font-bold leading-tight outline-none"
              style={{ color: 'var(--color-text-primary)' }}
            />
          </div>

          {hasBetLimit && (
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('markets.maxBet', { amount: maxBetLimit })}
            </p>
          )}

          {(isInsufficient || isOverLimit) && (
            <p className="mt-1 text-xs" style={{ color: 'var(--color-error)' }}>
              {isInsufficient
                ? t('markets.insufficientBalance')
                : t('markets.exceedsMaxBet', { amount: maxBetLimit })}
            </p>
          )}

          {/* Quick-add chips (+$1 / +$5 / +$10 / +$100) + All In */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {QUICK_ADD_AMOUNTS.map((inc) => (
              <Button
                key={inc}
                variant="secondary"
                type="button"
                className="text-sm"
                disabled={isUntradable}
                onClick={() => handleAmountChange(((stake ?? 0) + inc).toFixed(2))}
              >
                +${inc}
              </Button>
            ))}
            <Button
              variant="secondary"
              onClick={handleAllIn}
              type="button"
              className="text-sm"
              disabled={isUntradable}
            >
              {t('markets.allIn')}
            </Button>
          </div>
        </div>

        {/* Low-liquidity warning: book depth ran out before stake was filled. */}
        {isLowLiquidity && (
          <div className="rounded-lg border p-3 text-sm" style={warningBoxStyle}>
            {t('markets.lowLiquidity')}
            {quote && quote.available_stake != null && quote.available_stake > 0 && (
              <span className="mt-1 block font-medium">
                {t('markets.maxAvailableStake', { amount: quote.available_stake.toFixed(2) })}
              </span>
            )}
          </div>
        )}

        {/* Settlement summary — one block, no nested card. "To win" is the
            climax; everything else (avg price, profit, post-bet balances) sits
            quietly beneath it, separated by a hairline. */}
        {toWin !== null && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {t('markets.toWin')}
              </span>
              <span
                className="flex items-center gap-2 text-2xl font-bold"
                style={{ color: 'var(--color-win)' }}
              >
                {/* Fixed-width spinner slot on the LEFT so the amount never shifts
                    when the quote refetch toggles it. */}
                <span aria-hidden className="inline-flex w-4 shrink-0 justify-center">
                  {quoteFetching ? <Spinner size="sm" /> : null}
                </span>
                <span>${toWin.toFixed(2)}</span>
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--color-text-muted)' }}>{t('markets.avgPrice')}</span>
              <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                {formatSharePrice(displayPrice)}
              </span>
            </div>
            {profitIfWin !== null && (
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--color-text-muted)' }}>{t('markets.profitIfWin')}</span>
                <span className="font-mono" style={{ color: 'var(--color-win)' }}>
                  +${profitIfWin.toFixed(2)}
                </span>
              </div>
            )}

            {/* Post-bet balance preview (our extra over the reference) */}
            {balanceIfWin !== null && balanceIfLose !== null && (
              <>
                <div className="my-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {t('markets.afterBetIfWin')}
                  </span>
                  <span className="font-mono">
                    <span style={{ color: 'var(--color-win)' }}>{balanceIfWin.toFixed(2)}</span>
                    <span className="mx-1" style={{ color: 'var(--color-text-muted)' }}>
                      ←
                    </span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {availableBalance.toFixed(2)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {t('markets.afterBetIfLose')}
                  </span>
                  <span className="font-mono">
                    <span style={{ color: 'var(--color-error)' }}>{balanceIfLose.toFixed(2)}</span>
                    <span className="mx-1" style={{ color: 'var(--color-text-muted)' }}>
                      ←
                    </span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {availableBalance.toFixed(2)}
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Book unavailable: explain why the CTA is disabled. */}
        {isQuoteUnavailable && !isQuoteLoading && (
          <div className="rounded-lg border p-3 text-sm" style={warningBoxStyle}>
            {t('markets.quoteUnavailable')}
          </div>
        )}

        {/* Quote is loading and we don't have a payout to render yet */}
        {isQuoteLoading && toWin === null && (
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

        {/* Primary CTA full-width, secondary Cancel below (Polymarket-style) */}
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="w-full"
          >
            {isPending ? t('common.saving') : t('markets.confirmBet')}
          </Button>
          <Button variant="secondary" onClick={onClose} type="button" className="w-full">
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
