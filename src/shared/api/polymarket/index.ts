/**
 * Polymarket Gamma API — types and helpers used by the React frontend.
 * Plain TypeScript only; no Deno-specific imports.
 *
 * Gamma API base: https://gamma-api.polymarket.com
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

// ─── Gamma API response types ─────────────────────────────────────────────────

/** A single outcome token returned by the Gamma API. */
export interface GammaToken {
  /** Polymarket ERC-1155 token id. */
  token_id: string;
  /** Human-readable outcome label, e.g. "Yes" or "No". */
  outcome: string;
  /** Implied probability price in [0, 1]. Convert to odds with `priceToOdds`. */
  price: number;
  /** True when this token is the winner of a resolved market. */
  winner: boolean;
}

/** A market object returned by the Gamma API `/markets` endpoint. */
export interface GammaMarket {
  /** Unique market identifier (also used as `polymarket_id` in our DB). */
  condition_id: string;
  /** Human-readable question text. */
  question: string;
  /** URL slug, e.g. "will-trump-win-2024". */
  market_slug: string;
  /** Optional category tag, e.g. "Politics". */
  category: string | null;
  /** ISO-8601 close date or null. */
  end_date_iso: string | null;
  /** Whether this market is currently active for trading. */
  active: boolean;
  /** Whether trading is closed (but market may not be resolved yet). */
  closed: boolean;
  /** Whether the market has been resolved. */
  resolved: boolean;
  /**
   * JSON-serialised array of outcome names, e.g. '["Yes","No"]'.
   * Use `JSON.parse(gm.outcomes) as string[]` to deserialise.
   */
  outcomes: string;
  /**
   * JSON-serialised array of price strings matching `outcomes`,
   * e.g. '["0.62","0.38"]'.
   * Use `JSON.parse(gm.outcomePrices) as string[]` to deserialise.
   */
  outcomePrices: string;
  /** Total trading volume (as a decimal string). */
  volume: string;
  /** Current liquidity (as a decimal string). */
  liquidity: string;
  /** Cover image URL or null. */
  image: string | null;
  /** Canonical outcome token list with live prices and winner flags. */
  tokens: GammaToken[];
}

// ─── Odds helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a Polymarket implied-probability price to decimal odds.
 *
 * @example
 * priceToOdds(0.62) // → ~1.613
 * priceToOdds(0.5)  // → 2.0
 *
 * @param price  Implied probability in (0, 1].
 * @returns      Decimal odds ≥ 1. Returns 1 for invalid inputs.
 */
export function priceToOdds(price: number): number {
  if (!Number.isFinite(price) || price <= 0 || price > 1) return 1;
  return 1 / price;
}

/**
 * Convert decimal odds back to an implied probability price.
 *
 * @param odds  Decimal odds > 0.
 * @returns     Implied probability in (0, 1]. Returns 0 for invalid inputs.
 */
export function oddsToPrice(odds: number): number {
  if (!Number.isFinite(odds) || odds <= 0) return 0;
  return 1 / odds;
}

/**
 * Parse the JSON-string `outcomes` and `outcomePrices` fields from a GammaMarket
 * and return typed pairs. Falls back to an empty array on parse errors.
 */
export function parseOutcomes(
  gm: Pick<GammaMarket, 'outcomes' | 'outcomePrices'>,
): Array<{ name: string; price: number; odds: number }> {
  try {
    const names  = JSON.parse(gm.outcomes)      as string[];
    const prices = JSON.parse(gm.outcomePrices) as string[];
    return names.map((name, i) => {
      const price = parseFloat(prices[i] ?? '0');
      return { name, price, odds: priceToOdds(price) };
    });
  } catch {
    return [];
  }
}

// ─── Fetch helpers (for direct frontend use, if needed) ───────────────────────

/**
 * Fetch active markets from the Gamma API.
 * Note: in production the frontend reads markets from our Supabase DB
 * (via TanStack Query). This helper is provided for edge cases or debugging.
 */
export async function fetchActiveMarkets(
  limit = 100,
  offset = 0,
): Promise<GammaMarket[]> {
  const url =
    `${GAMMA_API_BASE}/markets?active=true&closed=false&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Gamma API error ${res.status}`);
  return res.json() as Promise<GammaMarket[]>;
}

/**
 * Fetch a single market by its condition_id from the Gamma API.
 */
export async function fetchMarketById(conditionId: string): Promise<GammaMarket> {
  const url = `${GAMMA_API_BASE}/markets/${conditionId}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Gamma API error ${res.status}`);
  return res.json() as Promise<GammaMarket>;
}
