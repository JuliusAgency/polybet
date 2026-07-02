import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SidePanel } from '@/shared/ui/SidePanel';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import { QuoteRetryNotice } from '@/shared/ui/QuoteRetryNotice';
import {
  usePlaceBetWithRetry,
  useBetQuote,
  useMyBetLimit,
  usePositions,
  SellForm,
} from '@/features/bet';
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
  /** Called after a successful trade (buy or sell). The host decides what
   *  happens next — the floating/overlay slip closes; the docked column stays
   *  open and just remounts with a cleared amount. NOT the user-dismiss signal. */
  onClose: () => void;
  onSuccess: () => void;
  /** Render as an in-flow sticky column instead of a floating overlay. */
  docked?: boolean;
  /** Hide the close (×) — used when the slip is a permanent page column. */
  showClose?: boolean;
  /** User-initiated dismiss: the × / Escape / Cancel controls. Kept separate
   *  from `onClose` so a docked host can stay open after a trade yet still be
   *  dismissed by the user. Defaults to `onClose`. */
  onRequestClose?: () => void;
}

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
  docked = false,
  showClose = true,
  onRequestClose,
}: BetSlipProps) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');

  // User-initiated dismiss (× / Escape / Cancel). Separate from `onClose`, which
  // fires on trade success — so a docked host keeps the panel open after a trade
  // yet the user can still close it. Falls back to `onClose` for overlay hosts
  // that treat "trade done" and "dismiss" the same way.
  const requestClose = onRequestClose ?? onClose;

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
  const {
    data: quote,
    isFetching: quoteFetching,
    refetch: refetchQuote,
  } = useBetQuote({
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

  // Placement state machine (place_bet + book re-warm + drift check + single
  // stale-book retry) lives in this hook; the slip just feeds it the computed
  // guards and quote and renders confirm / isPending / submitError.
  const { confirm, isPending, submitError, setSubmitError } = usePlaceBetWithRetry({
    market,
    selected,
    stake,
    quote,
    displayOdds,
    hasBetLimit,
    maxBetLimit,
    isValidStake,
    isInsufficient,
    isOverLimit,
    isUntradable,
    onSuccess,
    onClose,
  });

  const handleSelectOutcome = (id: string) => {
    setSelectedOutcomeId(id);
    setSubmitError(null);
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    setSubmitError(null);
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
    <SidePanel isOpen onClose={requestClose} docked={docked} showClose={showClose}>
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
            {/* B7: two-line context — market title on its own line, then the
                "Outcome · <side>" line with the side tinted by its colour. */}
            <p
              className="truncate text-sm font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {marketLabel}
            </p>
            <p className="truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {t('markets.outcome', { defaultValue: 'Outcome' })}
              <span className="mx-1" style={{ color: 'var(--color-text-muted)' }}>
                ·
              </span>
              <span style={{ color: outcomeColor, fontWeight: 600 }}>{selected.name}</span>
            </p>
          </div>
        </div>

        {/* Buy / Sell — B4: contained segmented pill (Polymarket-style); the
            order-type indicator stays on the inline-end. */}
        <div className="flex items-center justify-between">
          <div
            className="flex gap-1 rounded-lg p-1"
            style={{ backgroundColor: 'var(--color-bg-surface)' }}
          >
            {(['buy', 'sell'] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="rounded-md px-4 py-1.5 text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? 'var(--color-accent-contrast)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    border: 'none',
                    outline: 'none',
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
            className="flex items-center gap-1 text-sm"
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

            {/* Amount — B2: on mobile the inline label is hidden and the $-figure
            reads as a big CENTERED anchor; at md+ the label/right-aligned layout
            returns so the docked desktop column is unchanged. Same input node,
            handlers, aria-label, disabled, and colours. Grey when empty. */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="betslip-amount"
                  className="hidden text-base font-semibold md:block"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {t('markets.amount')}
                </label>
                <div className="flex min-w-0 flex-1 items-baseline justify-center gap-0.5 md:justify-end">
                  <span
                    className="shrink-0 text-5xl font-bold md:text-3xl"
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
                    className="w-full min-w-0 bg-transparent text-center text-5xl font-bold leading-tight outline-none md:text-end md:text-3xl"
                    style={{
                      color: amount ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    }}
                  />
                </div>
              </div>

              {/* Balance + max-bet hints sit quietly under the figure — centered
              on mobile with a separator, split left/right at md+. */}
              <div className="flex items-center justify-center gap-2 text-xs md:justify-between">
                <span className="min-w-0 truncate" style={{ color: 'var(--color-text-muted)' }}>
                  {t('markets.balance', { amount: availableBalance.toFixed(2) })}
                </span>
                {hasBetLimit && (
                  <>
                    <span
                      aria-hidden
                      className="md:hidden"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      ·
                    </span>
                    <span className="min-w-0 truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {t('markets.maxBet', { amount: maxBetLimit })}
                    </span>
                  </>
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

            {/* Book momentarily unavailable: present it as a transient, retryable
            state (auto-retry spinner + manual "Try again") instead of a terminal
            error — the slip stays open and recovers when the quote refreshes. */}
            {isQuoteUnavailable && !isQuoteLoading && (
              <QuoteRetryNotice
                message={t('markets.quoteUnavailable')}
                retryLabel={t('common.tryAgain')}
                isRetrying={quoteFetching}
                onRetry={() => {
                  setSubmitError(null);
                  void refetchQuote();
                }}
              />
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

            {/* Single blue "Trade" CTA (Polymarket-style) + terms footer. B6: the
            block carries a bottom safe-area pad so on the mobile bottom sheet the
            button/Terms clear the iOS home indicator (env() is 0 on non-notched
            and on the docked desktop column, so this is inert there). */}
            <div
              className="flex flex-col gap-3"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <Button
                variant="primary"
                onClick={confirm}
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
            <SellForm
              position={sellPosition}
              onClose={onClose}
              onSuccess={onSuccess}
              onCancel={requestClose}
            />
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
              <Button variant="secondary" onClick={requestClose} type="button" className="w-full">
                {t('common.cancel')}
              </Button>
            </div>
          ))}
      </div>
    </SidePanel>
  );
};
