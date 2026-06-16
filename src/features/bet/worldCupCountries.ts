import type { Market } from '@/entities/market';
import { getYesOutcome, getYesProbability, isBinaryMarket } from '@/entities/market';
import { lookupCountry } from '@/shared/config/countries';

/**
 * A single country row of the "World Cup Winner" event, derived from its
 * per-country sub-market ("Will <country> win the 2026 FIFA World Cup?"). The
 * map renders one flag marker / list row per country.
 */
export interface WorldCupCountry {
  /** Sub-market id — used to deep-link the event detail with this market pre-selected. */
  marketId: string;
  /** Display name (resolved to the canonical country name when matched). */
  name: string;
  /** flag-icons code, or null when the name didn't match a known country. */
  iso2: string | null;
  /** Centroid latitude (globe marker), or null when unmatched. */
  lat: number | null;
  /** Centroid longitude (globe marker), or null when unmatched. */
  lng: number | null;
  /** Yes-side win probability (0..1), or null when no price yet. */
  probability: number | null;
  /** Yes outcome id — pre-selected in the BetSlip so the user buys "win". */
  yesOutcomeId: string | null;
}

// "Will France win the 2026 FIFA World Cup?" → "France".
const WILL_WIN_RE = /^\s*will\s+(.+?)\s+win\b/i;

/** Derive a country name from a sub-market: prefer group_label, else parse the question. */
export function deriveCountryName(market: Pick<Market, 'group_label' | 'question'>): string {
  const label = market.group_label?.trim();
  if (label) return label;
  const match = market.question?.match(WILL_WIN_RE);
  if (match) return match[1].trim();
  return market.question?.trim() ?? '';
}

/**
 * Transform the markets of the "World Cup Winner" event into country rows,
 * sorted by win probability DESC (nulls last, stable). Only binary Yes/No
 * sub-markets are kept — non-binary or malformed markets are dropped so the
 * list stays a clean roster of nations.
 */
export function marketsToWorldCupCountries(markets: readonly Market[]): WorldCupCountry[] {
  const countries = markets
    .filter((m) => isBinaryMarket(m) && getYesOutcome(m) != null)
    .map<WorldCupCountry>((m) => {
      const name = deriveCountryName(m);
      const geo = lookupCountry(name);
      return {
        marketId: m.id,
        name: geo?.name ?? name,
        iso2: geo?.iso2 ?? null,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        probability: getYesProbability(m),
        yesOutcomeId: getYesOutcome(m)?.id ?? null,
      };
    });

  return countries
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const pa = a.c.probability;
      const pb = b.c.probability;
      if (pa == null && pb == null) return a.i - b.i;
      if (pa == null) return 1;
      if (pb == null) return -1;
      if (pa !== pb) return pb - pa;
      return a.i - b.i;
    })
    .map(({ c }) => c);
}
