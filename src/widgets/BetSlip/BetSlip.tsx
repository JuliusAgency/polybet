import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { SidePanel } from '@/shared/ui/SidePanel';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import {
  usePlaceBet,
  OddsDriftError,
  useBetQuote,
  useMyBetLimit,
  usePositions,
  SellForm,
} from '@/features/bet';
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

  // Buy / Sell mode. In Sell mode we look up the user's open position in the
  // selected outcome to drive the inline SellForm.
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const { data: positions } = usePositions();
  const sellPosition = useMemo(
    () => (positions ?? []).find((p) => p.outcome_id === selectedOutcomeId) ?? null,
    [positions, selectedOutcomeId]
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

  // Polymarket-style header: event thumbnail + event title + "Market · Outcome".
  // The selected outcome name is tinted by its canonical side (Yes→win green,
  // No→loss red), matching the solid outcome buttons below.
  const selectedIndex = outcomeButtons.findIndex((o) => o.id === selectedOutcomeId);
  const outcomeColor =
    selectedIndex === 0
      ? 'var(--color-win)'
      : selectedIndex === 1
        ? 'var(--color-loss)'
        : 'var(--color-text-primary)';
  const headerImage = market.image_url ?? market.event?.image_url ?? null;
  const eventTitle = market.event?.title ?? null;
  const marketLabel = market.group_label ?? market.question;

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

    // Refresh the live book, validate, drift-check and place. quote-bet also
    // re-UPSERTs market_outcome_books on every call, so this refresh is exactly
    // what keeps place_bet's freshness guard satisfied. The book bound is 30s
    // (see migration 20260603100437), comfortably above the 2s quote poll, so a
    // freshly-refreshed quote effectively never trips the server's stale guard.
    setSubmitError(null);
    const roundedStake = Math.round(stake! * 100) / 100;
    const quoteKey = ['bet-quote', selected.polymarket_token_id, roundedStake] as const;

    // Refetch the live quote and return it, or null if the book came back
    // unavailable (CLOB transient failure between debounce and Confirm) — the
    // server has no mid-price fallback, so a null book means "cannot place".
    const refreshQuote = async (): Promise<BetQuote | null> => {
      try {
        await queryClient.refetchQueries({ queryKey: quoteKey });
      } catch {
        // Fall back to the last known quote below.
      }
      const next = queryClient.getQueryData<BetQuote | null>(quoteKey) ?? quote ?? null;
      return next && next.book_updated_at !== null ? next : null;
    };

    // Surface a non-stale server/validation error to the user (no retry). Maps
    // raw server guard strings to friendly messages instead of leaking the
    // English Postgres exception.
    const surfaceError = (err: unknown): void => {
      if (err instanceof OddsDriftError) {
        setSubmitError(
          t('markets.oddsChanged', {
            odds: err.latestOdds !== null ? err.latestOdds.toFixed(2) : '—',
          })
        );
        return;
      }
      const raw = err instanceof Error ? err.message : '';
      if (raw.includes('Insufficient liquidity')) {
        setSubmitError(t('markets.lowLiquidity'));
        return;
      }
      if (raw.includes('Stake exceeds effective maximum bet limit')) {
        setSubmitError(hasBetLimit ? t('markets.exceedsMaxBet', { amount: maxBetLimit }) : raw);
        return;
      }
      setSubmitError(raw || t('common.unknownError'));
    };

    // One placement attempt: re-warm + lock the price against the fresh quote,
    // drift-check, then call place_bet. Returns 'stale' when the server rejected
    // on freshness (the caller may retry once), 'ok' on success, or 'handled'
    // when an error was already surfaced to the user.
    const attempt = async (): Promise<'ok' | 'stale' | 'handled'> => {
      const fresh = await refreshQuote();
      if (!fresh) {
        setSubmitError(t('markets.quoteUnavailable'));
        return 'handled';
      }
      if (fresh.partial || fresh.shares <= 0) {
        setSubmitError(t('markets.lowLiquidity'));
        return 'handled';
      }
      const lockOdds = fresh.effective_odds;
      if (lockOdds > 0 && displayOdds > 0) {
        const drift = Math.abs(lockOdds - displayOdds) / displayOdds;
        if (drift > ODDS_DRIFT_TOLERANCE) {
          setSubmitError(t('markets.oddsChanged', { odds: lockOdds.toFixed(2) }));
          return 'handled';
        }
      }
      try {
        await placeBet({
          marketId: market.id,
          outcomeId: selected.id,
          stake: stake!,
          expectedOdds: lockOdds,
        });
        return 'ok';
      } catch (err) {
        const raw = err instanceof Error ? err.message : '';
        const isStale =
          raw.includes('Market price feed is stale') ||
          raw.includes('Market book is stale') ||
          raw.includes('Outcome price feed is stale');
        if (isStale) return 'stale';
        surfaceError(err);
        return 'handled';
      }
    };

    // First attempt; on a stale-book rejection, retry exactly once. The retry's
    // refreshQuote() re-warms the book server-side first, so transient
    // staleness clears silently — the user only sees the stale message if the
    // SECOND attempt also fails (e.g. CLOB persistently down).
    let result = await attempt();
    if (result === 'stale') {
      result = await attempt();
    }

    if (result === 'stale') {
      setSubmitError(t('markets.priceStaleRetry'));
      void queryClient.refetchQueries({ queryKey: ['event'] });
      void queryClient.refetchQueries({ queryKey: quoteKey });
      return;
    }
    if (result === 'ok') {
      toast.success(
        t('bet.notification.placed', { outcome: selected.name, stake: stake!.toFixed(2) }),
        { duration: 5000 }
      );
      onSuccess();
      onClose();
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
    <SidePanel isOpen onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Header — event thumbnail + event title + "Market · Outcome" */}
        <div className="flex items-center gap-3 pe-6">
          {headerImage && (
            <img
              src={headerImage}
              alt=""
              className="h-9 w-9 shrink-0 rounded-md object-cover"
              style={{ backgroundColor: 'var(--color-bg-base)' }}
            />
          )}
          <div className="min-w-0">
            {eventTitle && (
              <p className="truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {eventTitle}
              </p>
            )}
            <p
              className="truncate text-sm font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {marketLabel}
              <span className="mx-1" style={{ color: 'var(--color-text-muted)' }}>
                ·
              </span>
              <span style={{ color: outcomeColor }}>{selected.name}</span>
            </p>
          </div>
        </div>

        {/* Buy / Sell text tabs + order type, sharing a hairline divider */}
        <div
          className="flex items-center justify-between border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex gap-5">
            {(['buy', 'sell'] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="-mb-px border-b-2 pb-2 text-sm font-semibold transition-colors"
                  style={{
                    borderColor: active ? 'var(--color-text-primary)' : 'transparent',
                    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    background: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {t(m === 'buy' ? 'markets.buyTab' : 'markets.sellTab')}
                </button>
              );
            })}
          </div>
          {/* Order type — this app only supports market orders; shown for parity. */}
          <span
            aria-hidden
            className="flex items-center gap-1 pb-2 text-sm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('markets.orderTypeMarket')}
            <span className="text-xs">▾</span>
          </span>
        </div>

        {/* Outcome side selector (Yes / No) — solid Polymarket fill, cents */}
        <OutcomeButtons
          outcomes={outcomeButtons}
          size="xl"
          priceFormat="cents"
          appearance="solid"
          selectedId={selectedOutcomeId}
          onClick={handleSelectOutcome}
        />

        {mode === 'buy' && (
          <>
            {isUntradable && (
              <div className="rounded-lg border p-3 text-sm" style={warningBoxStyle}>
                {t('markets.outcomeUntradable')}
              </div>
            )}

            {/* Amount — label on the left, large $ figure on the right
            (Polymarket-style). Grey when empty. */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="betslip-amount"
                  className="text-base font-semibold"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {t('markets.amount')}
                </label>
                <div className="flex min-w-0 items-baseline justify-end gap-0.5">
                  <span
                    className="shrink-0 text-3xl font-bold"
                    style={{
                      color: amount ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    }}
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
                    aria-label={t('markets.amount')}
                    className="w-32 min-w-0 bg-transparent text-end text-3xl font-bold leading-tight outline-none"
                    style={{
                      color: amount ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    }}
                  />
                </div>
              </div>

              {/* Balance + max-bet hints sit quietly under the figure. */}
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {t('markets.balance', { amount: availableBalance.toFixed(2) })}
                </span>
                {hasBetLimit && (
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {t('markets.maxBet', { amount: maxBetLimit })}
                  </span>
                )}
              </div>

              {(isInsufficient || isOverLimit) && (
                <p className="text-xs" style={{ color: 'var(--color-error)' }}>
                  {isInsufficient
                    ? t('markets.insufficientBalance')
                    : t('markets.exceedsMaxBet', { amount: maxBetLimit })}
                </p>
              )}

              {/* Quick-add chips (+$1 / +$5 / +$10 / +$100), right-aligned */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {QUICK_ADD_AMOUNTS.map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    disabled={isUntradable}
                    onClick={() => handleAmountChange(((stake ?? 0) + inc).toFixed(2))}
                    className="rounded-lg border px-3 py-1 text-xs font-medium transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-secondary)',
                      backgroundColor: 'transparent',
                      cursor: isUntradable ? 'not-allowed' : 'pointer',
                    }}
                  >
                    +${inc}
                  </button>
                ))}
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
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {t('markets.profitIfWin')}
                    </span>
                    <span className="font-mono" style={{ color: 'var(--color-win)' }}>
                      +${profitIfWin.toFixed(2)}
                    </span>
                  </div>
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

            {/* Single blue "Trade" CTA (Polymarket-style) + terms footer */}
            <div className="flex flex-col gap-3">
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={isConfirmDisabled}
                className="w-full py-3 text-base"
              >
                {isPending ? t('common.saving') : t('markets.trade')}
              </Button>
              <p className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t('markets.byTradingTerms')}
              </p>
            </div>
          </>
        )}

        {mode === 'sell' &&
          (sellPosition && sellPosition.shares > 0 ? (
            <SellForm position={sellPosition} onClose={onClose} onSuccess={onSuccess} />
          ) : (
            <div className="flex flex-col gap-3">
              <div
                className="rounded-lg p-3 text-sm"
                style={{
                  backgroundColor: 'var(--color-bg-base)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {t('markets.noSharesToSell', { outcome: selected.name })}
              </div>
              <Button variant="secondary" onClick={onClose} type="button" className="w-full">
                {t('common.cancel')}
              </Button>
            </div>
          ))}
      </div>
    </SidePanel>
  );
};
