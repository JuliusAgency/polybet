import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { Market, MarketOutcome } from '@/entities/market';
import { usePlaceBet, OddsDriftError } from './usePlaceBet';
import type { BetQuote } from './useBetQuote';

// Match place_bet's c_odds_drift_tolerance (2%). Constants live in sync; if
// the backend tunes the threshold, mirror it here so the user doesn't get
// a silent server rejection after a passing client-side check.
const ODDS_DRIFT_TOLERANCE = 0.02;

export interface UsePlaceBetWithRetryParams {
  market: Market;
  /** Currently-selected outcome (the side being bought). */
  selected: MarketOutcome;
  /** Parsed, validated stake in dollars (null when the input is invalid). */
  stake: number | null;
  /** Live order-book quote for the selected token (from useBetQuote). */
  quote: BetQuote | null | undefined;
  /** Odds currently shown to the user; used as the drift baseline. */
  displayOdds: number;
  hasBetLimit: boolean;
  maxBetLimit: number | null | undefined;
  // Pre-computed client-side guards from the slip.
  isValidStake: boolean;
  isInsufficient: boolean;
  isOverLimit: boolean;
  isUntradable: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export interface UsePlaceBetWithRetry {
  /** Run the place-bet flow (validate → re-warm book → drift-check → place,
   *  retrying once on a stale book). Surfaces any error via submitError. */
  confirm: () => Promise<void>;
  isPending: boolean;
  submitError: string | null;
  /** Clear or set the submit error (the slip clears it on input changes). */
  setSubmitError: (error: string | null) => void;
}

/**
 * Bet-placement state machine extracted from the BetSlip widget. Owns the
 * place_bet mutation, the submit-error surface, the live-book re-warm + 2%
 * drift check, and the single stale-book retry. The slip computes the display
 * guards/quote and passes them in; this hook does the placement.
 */
export function usePlaceBetWithRetry({
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
}: UsePlaceBetWithRetryParams): UsePlaceBetWithRetry {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { mutateAsync: placeBet, isPending } = usePlaceBet();

  const confirm = async () => {
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

    // Re-warm the live book (quote-bet re-UPSERTs market_outcome_books on every
    // call) and read the freshest quote back, or null if the book came back
    // unavailable. The edge function now reports book_updated_at from the ACTUAL
    // DB write (not the in-memory walk — see quote-bet/index.ts), so a non-null
    // book_updated_at here means the server-side book is genuinely fresh and
    // place_bet will accept it; null means "cannot place, try again". This is why
    // falling back to the last observed quote is now safe — it can no longer
    // claim a fresh book the DB doesn't actually have (the old QA-400 cause).
    const refreshQuote = async (): Promise<BetQuote | null> => {
      try {
        await queryClient.refetchQueries({ queryKey: quoteKey });
      } catch {
        // Refetch threw (network / CLOB transient) — fall back to the last quote.
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

  return { confirm, isPending, submitError, setSubmitError };
}
