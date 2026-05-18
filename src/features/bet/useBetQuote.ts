import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import { useDebounce } from '@/shared/hooks/useDebounce';

// Lives in sync with quote_bet_payout(text, numeric) in
// 20260518101639_quote_bet_payout.sql. Each field maps to a column of the
// RPC's TABLE return. PostgREST returns the single row as the first element
// of the array — we destructure to a flat object.
export interface BetQuote {
  shares: number;
  filled_stake: number;
  avg_price: number;
  effective_odds: number;
  partial: boolean;
  book_updated_at: string | null;
}

interface UseBetQuoteOptions {
  /** CLOB token id (market_outcomes.polymarket_token_id). */
  tokenId: string | null | undefined;
  /** Raw stake from the input; debounced inside the hook before firing RPC. */
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
  const debouncedStake = useDebounce(stake !== null ? Math.round(stake * 100) / 100 : null, DEBOUNCE_MS);

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
      const { data, error } = await supabase.rpc('quote_bet_payout', {
        p_token_id: tokenId,
        p_stake: debouncedStake,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        shares: Number(row.shares),
        filled_stake: Number(row.filled_stake),
        avg_price: Number(row.avg_price),
        effective_odds: Number(row.effective_odds),
        partial: Boolean(row.partial),
        book_updated_at: row.book_updated_at ?? null,
      };
    },
  });
}
