import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import type { Market, MarketOutcome } from '@/entities/market';
import type { MarketEvent } from '@/entities/event';
import type { EventWithMarkets } from '@/features/bet';
import { BetSlip } from '@/widgets/BetSlip';
import { renderWithProviders } from '../../helpers/render';

// Module-scoped RPC mock so each test can re-program its response.
const rpcMock = vi.fn();
vi.mock('@/shared/api/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

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

async function seedEventCache(
  queryClient: QueryClient,
  market: Market,
  liveOutcome: MarketOutcome
): Promise<void> {
  // useEventById uses ['event', eventId] as the cache key. BetSlip's
  // handleConfirm calls refetchQueries on this key before submit, so we
  // prefetch with a stable queryFn — refetch then re-invokes the same fn
  // and the cache survives intact.
  const data: EventWithMarkets = {
    event: makeEvent(),
    markets: [{ ...market, market_outcomes: [liveOutcome] }],
  };
  await queryClient.prefetchQuery({
    queryKey: ['event', market.event_id],
    queryFn: async () => data,
    staleTime: Infinity,
  });
}

describe('BetSlip — guards against stale/untradable odds', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('disables Confirm when the outcome price is at the floor', async () => {
    // Floor is 0.001 (Polymarket parity). 0.0005 is below it and must trigger
    // the untradable warning + disabled Confirm. A 0.005 price is now legal
    // and would let the test pass through to the happy path.
    const outcome = makeOutcome({ price: 0.0005, effective_odds: 2000 });
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

    // Untradable warning shown.
    expect(screen.getAllByText(/no longer tradable|untradable|לא זמין/i).length).toBeGreaterThan(0);

    // Enter a valid stake — Confirm must STILL be disabled (untradable guard).
    const stakeInput = screen.getByLabelText(/stake/i);
    await userEvent.type(stakeInput, '10');

    const confirm = screen.getByRole('button', { name: /confirm/i });
    expect(confirm).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('sends expectedOdds and stake to place_bet on the happy path', async () => {
    const outcome = makeOutcome({ price: 0.5, effective_odds: 2 });
    const market = makeMarket(outcome);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    await seedEventCache(queryClient, market, outcome);

    rpcMock.mockResolvedValueOnce({ data: 'bet-uuid-1', error: null });

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={outcome}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
      { queryClient }
    );

    await userEvent.type(screen.getByLabelText(/stake/i), '25');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    // Wait for the async confirm path to flush.
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

  it('does not submit when live drift > 2 %; surfaces updated odds for re-confirmation', async () => {
    // Slip opened at effective_odds=2; live cache has 2.5 (25 % drift).
    const opened = makeOutcome({ id: 'out-yes', price: 0.5, effective_odds: 2 });
    const market = makeMarket(opened);
    const drifted = makeOutcome({ id: 'out-yes', price: 0.4, effective_odds: 2.5 });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    await seedEventCache(queryClient, market, drifted);
    // BetSlip pre-fetches the event before submit. Force the refetch to a
    // no-op so we test the post-cache lookup independent of TanStack
    // refetch semantics (which in some versions can drop data when a
    // re-fetch resolves with a different identity).
    vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined);
    // Guard: if the pre-submit refresh has somehow lost the cache and the
    // RPC ends up being called, surface that as a clear failure rather than
    // a destructure crash inside usePlaceBet.
    rpcMock.mockResolvedValue({ data: 'should-not-be-called', error: null });

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={opened}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
      { queryClient }
    );

    // Sanity-check the cache holds the drifted outcome before we click.
    const cached = queryClient.getQueryData(['event', market.event_id]) as EventWithMarkets;
    expect(cached?.markets?.[0]?.market_outcomes?.[0]?.effective_odds).toBe(2.5);

    await userEvent.type(screen.getByLabelText(/stake/i), '10');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    // Allow microtasks (await refetch, await placeBet) to flush.
    await new Promise((r) => setTimeout(r, 50));

    // Cache snapshot AFTER click — drifted outcome must still be present.
    const afterClick = queryClient.getQueryData(['event', market.event_id]) as
      | EventWithMarkets
      | undefined;
    expect(afterClick?.markets?.[0]?.market_outcomes?.[0]?.effective_odds).toBe(2.5);

    // Drift branch fired → RPC must not have been called.
    expect(rpcMock).not.toHaveBeenCalled();

    await vi.waitFor(
      () => {
        expect(screen.getByText(/odds have been updated|המקדמים עודכנו/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('surfaces the drift error when the RPC rejects with P0002', async () => {
    const outcome = makeOutcome({ price: 0.5, effective_odds: 2 });
    const market = makeMarket(outcome);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    await seedEventCache(queryClient, market, outcome);

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'P0002',
        message: 'Odds changed (expected 2.00, actual 2.50)',
      },
    });

    renderWithProviders(
      <BetSlip
        market={market}
        outcome={outcome}
        availableBalance={500}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
      { queryClient }
    );

    await userEvent.type(screen.getByLabelText(/stake/i), '10');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await vi.waitFor(() => {
      expect(screen.getByText(/odds have been updated|המקדמים עודכנו/i)).toBeInTheDocument();
    });
  });
});
