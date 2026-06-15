import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Market, MarketOutcome } from '@/entities/market';
import type { MarketEvent } from '@/entities/event';
import type { BetQuote } from '@/features/bet';
import { BetSlip } from '@/widgets/BetSlip';
import { renderWithProviders } from '../../helpers/render';

// Module-scoped RPC mock so each test can re-program place_bet's response.
const rpcMock = vi.fn();
vi.mock('@/shared/api/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

// Mock the bet hooks. useBetQuote drives the order-book quote — mocking it
// sidesteps the edge-function/auth HTTP chain so we can drive the slip's
// shares-model UI deterministically. usePlaceBet / OddsDriftError stay real so
// the P0002 drift mapping is exercised end-to-end.
const quoteMock = vi.fn();
vi.mock('@/features/bet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/bet')>();
  return {
    ...actual,
    useBetQuote: (...args: unknown[]) => quoteMock(...args),
    useMyBetLimit: () => ({ data: null }),
    // BetSlip's Sell tab reads positions; stub it so the buy-focused tests
    // don't hit supabase.from (the supabase mock only provides rpc).
    usePositions: () => ({ data: [] }),
  };
});

const FRESH_BOOK_AT = '2026-06-01T00:00:00.000Z';

/** A fully-fillable book quote: 50 shares for a $25 stake at avg 0.5, no drift. */
function bookQuote(overrides: Partial<BetQuote> = {}): { data: BetQuote; isFetching: boolean } {
  return {
    data: {
      shares: 50,
      filled_stake: 25,
      avg_price: 0.5,
      effective_odds: 2,
      partial: false,
      book_updated_at: FRESH_BOOK_AT,
      available_stake: 1000,
      ...overrides,
    },
    isFetching: false,
  };
}

function makeEvent(): MarketEvent {
  return {
    id: 'evt-1',
    title: 'Test event',
    description: null,
    category: 'Politics',
    image_url: null,
    close_at: null,
    status: 'open',
    volume: 1_000_000,
    tag_slug: 'politics',
    tag_label: 'Politics',
    tag_slugs: ['politics'],
  };
}

function makeOutcome(opts: Partial<MarketOutcome> & { price: number | null }): MarketOutcome {
  const price = opts.price;
  const odds = price != null && price > 0 ? 1 / price : 1;
  return {
    id: opts.id ?? 'out-yes',
    name: opts.name ?? 'Yes',
    price,
    odds,
    effective_odds: opts.effective_odds ?? odds,
    updated_at: opts.updated_at ?? new Date().toISOString(),
    polymarket_token_id: opts.polymarket_token_id ?? 'tok-yes',
  };
}

function makeMarket(outcomes: MarketOutcome[]): Market {
  return {
    id: 'mk-1',
    polymarket_id: 'pm-1',
    question: 'Will it rain tomorrow?',
    status: 'open',
    winning_outcome_id: null,
    category: 'Politics',
    image_url: null,
    close_at: null,
    last_synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    volume: 1000,
    sort_volume: 1000,
    event_id: 'evt-1',
    group_label: null,
    tag_slugs: ['politics'],
    event: makeEvent(),
    market_outcomes: outcomes,
  };
}

const YES = makeOutcome({
  id: 'out-yes',
  name: 'Yes',
  price: 0.71,
  polymarket_token_id: 'tok-yes',
});
const NO = makeOutcome({ id: 'out-no', name: 'No', price: 0.3, polymarket_token_id: 'tok-no' });

describe('BetSlip — shares model', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    quoteMock.mockReset();
    quoteMock.mockReturnValue(bookQuote());
  });

  it('disables Confirm when the selected outcome has no Polymarket token id', async () => {
    quoteMock.mockReturnValue({ data: undefined, isFetching: false });
    // makeOutcome's `?? 'tok-yes'` default would swallow a null token, so set it
    // explicitly to model a genuinely untradable selected outcome.
    const untradableYes: MarketOutcome = { ...YES, polymarket_token_id: null };
    const market = makeMarket([untradableYes, NO]);

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={untradableYes}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    expect(screen.getAllByText(/no longer tradable|untradable|לא זמין/i).length).toBeGreaterThan(0);

    await userEvent.type(screen.getByLabelText(/amount/i), '10');

    expect(screen.getByRole('button', { name: /trade/i })).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('shows the share price in cents and the shares to win', async () => {
    const market = makeMarket([YES, NO]);

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={YES}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    await userEvent.type(screen.getByLabelText(/amount/i), '25');

    // Outcome selector shows both sides in cents.
    expect(screen.getByText('71¢')).toBeInTheDocument();
    expect(screen.getByText('30¢')).toBeInTheDocument();
    // "To win" = shares ($50.00 for 50 shares at $1 each).
    expect(screen.getByText(/\$50\.00/)).toBeInTheDocument();
  });

  it('sends expectedOdds and the SELECTED outcome id to place_bet', async () => {
    const market = makeMarket([YES, NO]);
    rpcMock.mockResolvedValueOnce({ data: 'bet-uuid-1', error: null });

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={YES}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    await userEvent.type(screen.getByLabelText(/amount/i), '25');
    await userEvent.click(screen.getByRole('button', { name: /trade/i }));

    await vi.waitFor(() => {
      expect(rpcMock).toHaveBeenCalled();
    });
    expect(rpcMock).toHaveBeenCalledWith('place_bet', {
      p_market_id: market.id,
      p_outcome_id: YES.id,
      p_stake: 25,
      p_expected_odds: 2,
    });
  });

  it('switching side sends the OTHER outcome id (no stale selection)', async () => {
    const market = makeMarket([YES, NO]);
    rpcMock.mockResolvedValueOnce({ data: 'bet-uuid-2', error: null });

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={YES}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    await userEvent.type(screen.getByLabelText(/amount/i), '25');
    // Switch from the initially-selected Yes to No.
    await userEvent.click(screen.getByRole('button', { name: /no/i }));
    await userEvent.click(screen.getByRole('button', { name: /trade/i }));

    await vi.waitFor(() => {
      expect(rpcMock).toHaveBeenCalled();
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'place_bet',
      expect.objectContaining({ p_outcome_id: NO.id, p_stake: 25 })
    );
  });

  it('disables Confirm and warns when the order book is unavailable', async () => {
    quoteMock.mockReturnValue(bookQuote({ book_updated_at: null, available_stake: null }));
    const market = makeMarket([YES, NO]);

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={YES}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    await userEvent.type(screen.getByLabelText(/amount/i), '25');

    expect(screen.getByText(/order book is unavailable|לא זמין/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trade/i })).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('surfaces the drift error when the RPC rejects with P0002', async () => {
    const market = makeMarket([YES, NO]);
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0002', message: 'Odds changed (expected 2.00, actual 2.50)' },
    });

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={YES}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    await userEvent.type(screen.getByLabelText(/amount/i), '25');
    await userEvent.click(screen.getByRole('button', { name: /trade/i }));

    await vi.waitFor(() => {
      expect(screen.getByText(/odds have been updated|המקדמים עודכנו/i)).toBeInTheDocument();
    });
  });
});
