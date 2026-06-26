import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { useSellPosition, PriceDriftError } from '../useSellPosition';
import { useSellQuote, type SellQuote } from '../useSellQuote';
import type { Position } from '@/entities/position';
import { formatSharePrice } from '@/shared/utils';

// Percentage quick-fills for the sell quantity, plus Max. Selling is denominated
// in SHARES (you hold N, sell some/all) — the dollar proceeds are derived from
// the live bid quote.
const QUICK_PCTS = [25, 50, 100] as const;

// Match sell_position's c_price_drift_tolerance (2%). Mirror the backend bound
// so the user doesn't get a silent server rejection after a passing client check.
const PRICE_DRIFT_TOLERANCE = 0.02;

export interface SellFormProps {
  position: Position;
  onClose: () => void;
  onSuccess?: () => void;
}

const parseShares = (value: string): number | null => {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const n = Number(value);
  return isFinite(n) && n > 0 ? n : null;
};

/**
 * The sell-position form body, sans modal chrome. Used standalone inside the
 * SellSlip modal (from the Portfolio) and inline inside the BetSlip Sell tab
 * (from the event page).
 */
export const SellForm = ({ position, onClose, onSuccess }: SellFormProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const held = position.shares;
  const tokenId = position.market_outcomes?.polymarket_token_id ?? null;
  const outcomeName = position.market_outcomes?.name ?? '—';

  const shares = parseShares(amount);
  const isValid = shares !== null;
  const isOverHeld = isValid && shares! > held + 1e-9;

  const { mutateAsync: sell, isPending } = useSellPosition();

  const quoteEnabled = isValid && !isOverHeld && Boolean(tokenId);
  const { data: quote, isFetching: quoteFetching } = useSellQuote({
    tokenId,
    shares: isValid ? shares! : null,
    enabled: quoteEnabled,
  });

  const bookAvailable = Boolean(quote && quote.book_updated_at !== null);
  const isQuoteReady = Boolean(quote && bookAvailable && !quote.partial && quote.proceeds > 0);
  const isQuoteUnavailable = Boolean(quote && !bookAvailable);
  const isLowLiquidity = Boolean(quote && bookAvailable && quote.partial);
  const isQuoteLoading = quoteEnabled && !quote && Boolean(tokenId);

  // Realized = proceeds − sold shares' cost basis (shares * avg entry price).
  const proceeds = isQuoteReady ? quote!.proceeds : null;
  const sellPrice = isQuoteReady ? quote!.avg_price : null;
  const realizedPnl =
    isQuoteReady && shares !== null ? quote!.proceeds - shares * position.avg_price : null;

  const setPct = (pct: number) => {
    const v = (held * pct) / 100;
    setAmount(pct === 100 ? String(held) : (Math.floor(v * 1e4) / 1e4).toString());
    setSubmitError(null);
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    setSubmitError(null);
  };

  const handleConfirm = async () => {
    if (isPending) return;
    if (!isValid || isOverHeld) return;
    if (!tokenId) {
      setSubmitError(t('portfolio.outcomeUntradable'));
      return;
    }
    if (!quote || quote.book_updated_at === null) {
      setSubmitError(t('portfolio.sellQuoteUnavailable'));
      return;
    }
    if (quote.partial || quote.proceeds <= 0) {
      setSubmitError(t('portfolio.sellLowLiquidity'));
      return;
    }

    // Pre-submit refetch so the locked price matches the freshest bid the user
    // could have seen (closes the poll→Confirm race; quote-sell re-UPSERTs the
    // book). Falls back to the last observed quote — which is now safe because
    // the edge function reports book_updated_at from the ACTUAL DB write (see
    // quote-sell/index.ts), so a non-null book_updated_at can no longer claim a
    // fresh book the DB doesn't have (the old QA-stale cause).
    setSubmitError(null);
    const roundedShares = Math.round(shares! * 1e4) / 1e4;
    const quoteKey = ['sell-quote', tokenId, roundedShares] as const;
    try {
      await queryClient.refetchQueries({ queryKey: quoteKey });
    } catch {
      // keep last known quote — the server-side guard catches real staleness
    }
    const fresh: SellQuote | null =
      queryClient.getQueryData<SellQuote | null>(quoteKey) ?? quote ?? null;

    if (!fresh || fresh.book_updated_at === null) {
      setSubmitError(t('portfolio.sellQuoteUnavailable'));
      return;
    }
    if (fresh.partial || fresh.proceeds <= 0) {
      setSubmitError(t('portfolio.sellLowLiquidity'));
      return;
    }
    const lockPrice = fresh.avg_price;
    if (sellPrice && sellPrice > 0) {
      const drift = Math.abs(lockPrice - sellPrice) / sellPrice;
      if (drift > PRICE_DRIFT_TOLERANCE) {
        setSubmitError(t('portfolio.priceChanged', { price: formatSharePrice(lockPrice) }));
        return;
      }
    }

    try {
      await sell({ positionId: position.id, shares: shares!, expectedPrice: lockPrice });
      toast.success(
        t('portfolio.sellNotification', { shares: shares!.toFixed(2), outcome: outcomeName }),
        { duration: 5000 }
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      if (err instanceof PriceDriftError) {
        setSubmitError(
          t('portfolio.priceChanged', {
            price: err.latestPrice !== null ? formatSharePrice(err.latestPrice) : '—',
          })
        );
        return;
      }
      const raw = err instanceof Error ? err.message : '';
      if (/Insufficient liquidity/i.test(raw)) {
        setSubmitError(t('portfolio.sellLowLiquidity'));
        return;
      }
      if (/Market book is stale|Market price feed is stale|Market book unavailable/i.test(raw)) {
        setSubmitError(t('portfolio.sellQuoteUnavailable'));
        void queryClient.refetchQueries({ queryKey: quoteKey });
        return;
      }
      if (/not available for selling/i.test(raw)) {
        setSubmitError(t('portfolio.marketClosedForSelling'));
        return;
      }
      setSubmitError(raw || t('common.unknownError'));
    }
  };

  const isConfirmDisabled =
    !isValid ||
    isOverHeld ||
    isPending ||
    !tokenId ||
    isLowLiquidity ||
    isQuoteLoading ||
    isQuoteUnavailable ||
    proceeds === null;

  const warningBoxStyle = {
    borderColor: 'var(--color-error)',
    color: 'var(--color-error)',
    backgroundColor: 'color-mix(in oklch, var(--color-error) 8%, var(--color-bg-base))',
  } as const;

  const pnlColor =
    realizedPnl === null
      ? 'var(--color-text-secondary)'
      : realizedPnl >= 0
        ? 'var(--color-win)'
        : 'var(--color-loss)';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {position.markets?.question ?? '—'}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {outcomeName} · {t('portfolio.heldShares', { shares: held.toFixed(2) })} ·{' '}
          {t('portfolio.avgEntry', { price: formatSharePrice(position.avg_price) })}
        </p>
      </div>

      {/* Shares to sell */}
      <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-bg-base)' }}>
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="sellslip-amount"
            className="text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t('portfolio.sellSharesLabel')}
          </label>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t('portfolio.heldShares', { shares: held.toFixed(2) })}
          </span>
        </div>

        <input
          id="sellslip-amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          placeholder="0"
          aria-label={t('portfolio.sellSharesLabel')}
          className="mt-2 w-full min-w-0 bg-transparent text-end text-3xl font-bold leading-tight outline-none"
          style={{ color: 'var(--color-text-primary)' }}
        />

        {isOverHeld && (
          <p className="mt-1 text-xs" style={{ color: 'var(--color-error)' }}>
            {t('portfolio.cannotSellMoreThanHeld')}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {QUICK_PCTS.map((pct) => (
            <Button
              key={pct}
              variant="secondary"
              type="button"
              className="text-sm"
              onClick={() => setPct(pct)}
            >
              {pct}%
            </Button>
          ))}
          <Button variant="secondary" type="button" className="text-sm" onClick={() => setPct(100)}>
            {t('portfolio.sellMax')}
          </Button>
        </div>
      </div>

      {isLowLiquidity && (
        <div className="rounded-lg border p-3 text-sm" style={warningBoxStyle}>
          {t('portfolio.sellLowLiquidity')}
          {quote && quote.available_shares != null && quote.available_shares > 0 && (
            <span className="mt-1 block font-medium">
              {t('portfolio.maxSellable', { shares: quote.available_shares.toFixed(2) })}
            </span>
          )}
        </div>
      )}

      {/* Proceeds summary */}
      {proceeds !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('portfolio.youReceive')}
            </span>
            <span
              className="flex items-center gap-2 text-2xl font-bold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <span aria-hidden className="inline-flex w-4 shrink-0 justify-center">
                {quoteFetching ? <Spinner size="sm" /> : null}
              </span>
              <span>${proceeds.toFixed(2)}</span>
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--color-text-muted)' }}>{t('portfolio.avgSellPrice')}</span>
            <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>
              {sellPrice !== null ? formatSharePrice(sellPrice) : '—'}
            </span>
          </div>
          {realizedPnl !== null && (
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--color-text-muted)' }}>{t('portfolio.realizedPnl')}</span>
              <span className="font-mono" style={{ color: pnlColor }}>
                {realizedPnl >= 0 ? '+' : ''}
                {realizedPnl.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {isQuoteUnavailable && !isQuoteLoading && (
        <div className="rounded-lg border p-3 text-sm" style={warningBoxStyle}>
          {t('portfolio.sellQuoteUnavailable')}
        </div>
      )}

      {isQuoteLoading && proceeds === null && (
        <div
          className="flex items-center gap-2 rounded-lg p-3 text-sm"
          style={{ backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-secondary)' }}
        >
          <Spinner size="sm" />
          {t('portfolio.quoteUpdating')}
        </div>
      )}

      {submitError && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {submitError}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={isConfirmDisabled}
          className="w-full"
        >
          {isPending ? t('common.saving') : t('portfolio.confirmSell')}
        </Button>
        <Button variant="secondary" onClick={onClose} type="button" className="w-full">
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
};
