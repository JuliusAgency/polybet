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
  };
});

const FRESH_BOOK_AT = '2026-06-01T00:00:00.000Z';

/** A fully-fillable book quote: stake/price shares at avg price, no drift. */
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

function makeMarket(outcome: MarketOutcome): Market {
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
    market_outcomes: [outcome],
  };
}

describe('BetSlip — shares model', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    quoteMock.mockReset();
    quoteMock.mockReturnValue(bookQuote());
  });

  it('disables Confirm when the outcome has no Polymarket token id', async () => {
    quoteMock.mockReturnValue({ data: undefined, isFetching: false });
    // makeOutcome's `?? 'tok-yes'` default would swallow a null token, so set it
    // explicitly after construction to model a genuinely untradable outcome.
    const outcome: MarketOutcome = {
      ...makeOutcome({ price: 0.5, effective_odds: 2 }),
      polymarket_token_id: null,
    };
    const market = makeMarket(outcome);

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={outcome}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    expect(screen.getAllByText(/no longer tradable|untradable|לא זמין/i).length).toBeGreaterThan(0);

    await userEvent.type(screen.getByLabelText(/stake/i), '10');

    const confirm = screen.getByRole('button', { name: /confirm/i });
    expect(confirm).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('shows the share price in cents and the shares to win', async () => {
    const outcome = makeOutcome({ price: 0.5, effective_odds: 2 });
    const market = makeMarket(outcome);

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={outcome}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    await userEvent.type(screen.getByLabelText(/stake/i), '25');

    // Cents price on the outcome chip + the Avg. Price line.
    expect(screen.getAllByText('50¢').length).toBeGreaterThan(0);
    // "To win" = shares ($50.00 for 50 shares at $1 each).
    expect(screen.getByText(/\$50\.00/)).toBeInTheDocument();
  });

  it('sends expectedOdds (book effective_odds) and stake to place_bet', async () => {
    const outcome = makeOutcome({ price: 0.5, effective_odds: 2 });
    const market = makeMarket(outcome);

    rpcMock.mockResolvedValueOnce({ data: 'bet-uuid-1', error: null });

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={outcome}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    await userEvent.type(screen.getByLabelText(/stake/i), '25');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await vi.waitFor(() => {
      expect(rpcMock).toHaveBeenCalled();
    });
    expect(rpcMock).toHaveBeenCalledWith('place_bet', {
      p_market_id: market.id,
      p_outcome_id: outcome.id,
      p_stake: 25,
      p_expected_odds: 2,
    });
  });

  it('disables Confirm and warns when the order book is unavailable', async () => {
    quoteMock.mockReturnValue(bookQuote({ book_updated_at: null, available_stake: null }));
    const outcome = makeOutcome({ price: 0.5, effective_odds: 2 });
    const market = makeMarket(outcome);

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={outcome}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    await userEvent.type(screen.getByLabelText(/stake/i), '25');

    expect(screen.getByText(/order book is unavailable|לא זמין/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('surfaces the drift error when the RPC rejects with P0002', async () => {
    const outcome = makeOutcome({ price: 0.5, effective_odds: 2 });
    const market = makeMarket(outcome);

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0002', message: 'Odds changed (expected 2.00, actual 2.50)' },
    });

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={outcome}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    await userEvent.type(screen.getByLabelText(/stake/i), '25');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await vi.waitFor(() => {
      expect(screen.getByText(/odds have been updated|המקדמים עודכנו/i)).toBeInTheDocument();
    });
  });
});
