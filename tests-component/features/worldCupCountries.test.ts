import { describe, it, expect } from 'vitest';
import type { Market } from '@/entities/market';
import { marketsToWorldCupCountries, deriveCountryName } from '@/features/bet';
import { lookupCountry } from '@/shared/config/countries';

// Minimal binary "Will <country> win?" sub-market builder.
function market(opts: {
  id: string;
  group_label?: string | null;
  question?: string;
  yes: number | null;
  yesToken?: string | null;
}): Market {
  return {
    id: opts.id,
    polymarket_id: `pm-${opts.id}`,
    question: opts.question ?? `Will ${opts.group_label} win the 2026 FIFA World Cup?`,
    status: 'open',
    winning_outcome_id: null,
    category: null,
    image_url: null,
    close_at: null,
    last_synced_at: null,
    created_at: '2026-06-16T00:00:00Z',
    event_id: 'evt-1',
    group_label: opts.group_label ?? null,
    event: null,
    market_outcomes: [
      {
        id: `${opts.id}-yes`,
        name: 'Yes',
        price: opts.yes,
        odds: 0,
        effective_odds: 0,
        updated_at: '2026-06-16T00:00:00Z',
        polymarket_token_id: opts.yesToken === undefined ? `tok-${opts.id}-yes` : opts.yesToken,
      },
      {
        id: `${opts.id}-no`,
        name: 'No',
        price: opts.yes == null ? null : 1 - opts.yes,
        odds: 0,
        effective_odds: 0,
        updated_at: '2026-06-16T00:00:00Z',
        polymarket_token_id: `tok-${opts.id}-no`,
      },
    ],
  } as unknown as Market;
}

describe('lookupCountry', () => {
  it('resolves canonical names, aliases and diacritics', () => {
    expect(lookupCountry('France')?.iso2).toBe('fr');
    expect(lookupCountry('united states')?.iso2).toBe('us');
    expect(lookupCountry('USA')?.iso2).toBe('us');
    expect(lookupCountry('South Korea')?.iso2).toBe('kr');
    expect(lookupCountry('Ivory Coast')?.iso2).toBe('ci');
    expect(lookupCountry("Côte d'Ivoire")?.iso2).toBe('ci');
    expect(lookupCountry('England')?.iso2).toBe('gb-eng');
    expect(lookupCountry('Atlantis')).toBeNull();
    expect(lookupCountry(null)).toBeNull();
  });
});

describe('deriveCountryName', () => {
  it('prefers group_label, falls back to parsing the question', () => {
    expect(deriveCountryName({ group_label: 'France', question: 'whatever' })).toBe('France');
    expect(
      deriveCountryName({ group_label: null, question: 'Will Spain win the 2026 FIFA World Cup?' })
    ).toBe('Spain');
    expect(
      deriveCountryName({ group_label: '  ', question: 'Will South Korea win the World Cup?' })
    ).toBe('South Korea');
  });
});

describe('marketsToWorldCupCountries', () => {
  it('sorts by Yes probability DESC and attaches geo', () => {
    const rows = marketsToWorldCupCountries([
      market({ id: 'm-br', group_label: 'Brazil', yes: 0.07 }),
      market({ id: 'm-fr', group_label: 'France', yes: 0.18 }),
      market({ id: 'm-es', group_label: 'Spain', yes: 0.14 }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['France', 'Spain', 'Brazil']);
    const france = rows[0];
    expect(france.iso2).toBe('fr');
    expect(france.marketId).toBe('m-fr');
    expect(france.yesOutcomeId).toBe('m-fr-yes');
    expect(france.probability).toBe(0.18);
    expect(typeof france.lat).toBe('number');
    expect(typeof france.lng).toBe('number');
  });

  it('keeps unmatched countries with null geo, nulls-last', () => {
    const rows = marketsToWorldCupCountries([
      market({ id: 'm-x', group_label: 'Atlantis', yes: null }),
      market({ id: 'm-fr', group_label: 'France', yes: 0.2 }),
    ]);
    expect(rows[0].name).toBe('France');
    expect(rows[1].iso2).toBeNull();
    expect(rows[1].lat).toBeNull();
    expect(rows[1].probability).toBeNull();
  });

  it('drops non-binary markets', () => {
    const threeWay = market({ id: 'm-3', group_label: 'Group', yes: 0.3 });
    threeWay.market_outcomes = [
      ...threeWay.market_outcomes,
      {
        id: 'm-3-maybe',
        name: 'Maybe',
        price: 0.3,
        odds: 0,
        effective_odds: 0,
        updated_at: '2026-06-16T00:00:00Z',
        polymarket_token_id: 'tok-3-maybe',
      },
    ];
    expect(marketsToWorldCupCountries([threeWay])).toHaveLength(0);
  });
});
