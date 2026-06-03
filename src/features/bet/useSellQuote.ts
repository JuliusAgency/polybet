import { useQuery } from '@tanstack/react-query';
import { invokeSupabaseFunction } from '@/shared/api/supabase/invokeSupabaseFunction';
import { useDebounce } from '@/shared/hooks/useDebounce';

// Shape returned by the quote-sell edge function (supabase/functions/quote-sell).
// It walks the live Polymarket CLOB bid side for the requested share count and
// UPSERTs the top-N levels into market_outcome_books, so the sell_position RPC
// reads the same numbers when the user clicks Sell.
//
// book_updated_at === null means CLOB was unreachable / no bid depth — the
// client should disable the Sell CTA and show "quote unavailable".
export interface SellQuote {
  proceeds: number;
  filled_shares: number;
  avg_price: number;
  partial: boolean;
  book_updated_at: string | null;
  /** Total bid depth in shares (max sellable). null when book is unavailable. */
  available_shares: number | null;
}

interface QuoteSellResponse {
  proceeds: number;
  filled_shares: number;
  avg_price: number;
  partial: boolean;
  book_updated_at: string | null;
  available_shares?: number | null;
}

interface UseSellQuoteOptions {
  /** CLOB token id (market_outcomes.polymarket_token_id) of the held outcome. */
  tokenId: string | null | undefined;
  /** Shares the user intends to sell; debounced before firing the edge fn. */
  shares: number | null;
  enabled?: boolean;
}

const DEBOUNCE_MS = 250;
// Match sell_position's 5s book-staleness bound; poll at half that.
const POLL_MS = 2_000;

export function useSellQuote({ tokenId, shares, enabled = true }: UseSellQuoteOptions) {
  // Round to 4 dp: shares can be fractional (sub-cent fills) but the key must
  // be stable while the user drags a percentage slider.
  const debouncedShares = useDebounce(
    shares !== null ? Math.round(shares * 1e4) / 1e4 : null,
    DEBOUNCE_MS
  );

  const queryEnabled =
    enabled &&
    typeof tokenId === 'string' &&
    tokenId.length > 0 &&
    debouncedShares !== null &&
    debouncedShares > 0;

  return useQuery<SellQuote | null>({
    queryKey: ['sell-quote', tokenId, debouncedShares],
    enabled: queryEnabled,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_MS / 2,
    queryFn: async () => {
      if (!tokenId || debouncedShares === null) return null;
      const { data, error } = await invokeSupabaseFunction<QuoteSellResponse>('quote-sell', {
        body: { polymarket_token_id: tokenId, shares: debouncedShares },
      });
      if (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      if (!data) return null;
      return {
        proceeds: Number(data.proceeds),
        filled_shares: Number(data.filled_shares),
        avg_price: Number(data.avg_price),
        partial: Boolean(data.partial),
        book_updated_at: data.book_updated_at ?? null,
        available_shares:
          data.available_shares === null || data.available_shares === undefined
            ? null
            : Number(data.available_shares),
      };
    },
  });
}
