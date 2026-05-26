import { useQuery } from '@tanstack/react-query';
import { invokeSupabaseFunction } from '@/shared/api/supabase/invokeSupabaseFunction';
import { useDebounce } from '@/shared/hooks/useDebounce';

// Shape returned by the quote-bet edge function (supabase/functions/quote-bet).
// The edge function walks the live Polymarket CLOB order book under the
// requested stake and also UPSERTs the top-N levels into market_outcome_books,
// so the place_bet RPC reads the same numbers when the user clicks Confirm.
//
// book_updated_at === null means CLOB was unreachable — the client should
// fall back to indicative odds (see BetSlip).
export interface BetQuote {
  shares: number;
  filled_stake: number;
  avg_price: number;
  effective_odds: number;
  partial: boolean;
  book_updated_at: string | null;
  // Total USD depth across all ask levels. null when the book is unavailable.
  available_stake: number | null;
}

interface QuoteBetResponse {
  shares: number;
  filled_stake: number;
  avg_price: number;
  effective_odds: number;
  partial: boolean;
  book_updated_at: string | null;
  available_stake?: number | null;
}

interface UseBetQuoteOptions {
  /** CLOB token id (market_outcomes.polymarket_token_id). */
  tokenId: string | null | undefined;
  /** Raw stake from the input; debounced inside the hook before firing the edge fn. */
  stake: number | null;
  /** Disable polling and fetch entirely (e.g. modal not open). */
  enabled?: boolean;
}

const DEBOUNCE_MS = 250;
// Match place_bet's c_book_max_staleness (5s). The UI polls at half that so
// users never see a quote that the server would reject for staleness.
const POLL_MS = 2_000;

export function useBetQuote({ tokenId, stake, enabled = true }: UseBetQuoteOptions) {
  // Rounding to 2 decimals stabilises the query key while the user types and
  // mirrors how the stake is sent to place_bet.
  const debouncedStake = useDebounce(
    stake !== null ? Math.round(stake * 100) / 100 : null,
    DEBOUNCE_MS
  );

  const queryEnabled =
    enabled &&
    typeof tokenId === 'string' &&
    tokenId.length > 0 &&
    debouncedStake !== null &&
    debouncedStake > 0;

  return useQuery<BetQuote | null>({
    queryKey: ['bet-quote', tokenId, debouncedStake],
    enabled: queryEnabled,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_MS / 2,
    queryFn: async () => {
      if (!tokenId || debouncedStake === null) return null;
      const { data, error } = await invokeSupabaseFunction<QuoteBetResponse>('quote-bet', {
        body: { polymarket_token_id: tokenId, stake: debouncedStake },
      });
      if (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      if (!data) return null;
      return {
        shares: Number(data.shares),
        filled_stake: Number(data.filled_stake),
        avg_price: Number(data.avg_price),
        effective_odds: Number(data.effective_odds),
        partial: Boolean(data.partial),
        book_updated_at: data.book_updated_at ?? null,
        available_stake:
          data.available_stake === null || data.available_stake === undefined
            ? null
            : Number(data.available_stake),
      };
    },
  });
}
