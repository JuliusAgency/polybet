import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import type { Market, MarketOutcome } from '@/entities/market';
import type { MarketEvent } from '@/entities/event';
import type { EventWithMarkets } from '@/features/bet';
import type { AuthContextValue } from '@/app/providers/AuthProvider/AuthContext';
import { renderWithProviders } from '../../helpers/render';

// EventDetailPage is a 388-line composition-heavy, role-aware page that fans out
// to ~7 data hooks (useEventById, useMyBets, useUserBalance, useSimilarEvents,
// useMarketRefresh, useArchiveMarket) plus the BetSlip widget. Driving all of
// that through the network is brittle; instead we mock the feature hooks the
// page consumes (the same vi.mock approach the SellSlip component test uses for
// useSellQuote) so we can deterministically exercise: loading, error, the
// single- and multi-market render branches, and the two setState-during-render
// blocks — the `?market=` deep-link preselect and the desktop docked-default.

// --- Module mocks --------------------------------------------------------

// useEventById is re-programmed per test via this controllable mock.
const eventByIdMock = vi.fn();
// usePositions-backed bets adapter, balance, similar events — return stable
// empty/default shapes; individual tests override only what they assert on.
const myBetsMock = vi.fn(() => ({ data: [] as unknown[] }));
const userBalanceMock = vi.fn(() => ({ data: { available: 250 } }));
const similarEventsMock = vi.fn(() => ({ data: [] as MarketEvent[], isLoading: false }));
const marketRefreshMock = vi.fn();

vi.mock('@/features/bet', () => ({
  useEventById: (...args: unknown[]) => eventByIdMock(...args),
  useMyBets: () => myBetsMock(),
  useUserBalance: () => userBalanceMock(),
  useSimilarEvents: () => similarEventsMock(),
  // The page hook and the MarketCard nested inside SingleMarketView both call
  // this; return the real { isRefreshing, lastResult, refresh } surface.
  useMarketRefresh: (...args: unknown[]) => marketRefreshMock(...args),
  // SingleMarketView (rendered for single-market events) pulls price history.
  usePriceHistory: () => ({ data: [], isLoading: false }),
  // EventPriceHistoryChart (rendered for multi-market events) pulls a per-market
  // series map keyed by market id — empty map renders an empty chart.
  useEventPriceHistory: () => ({ pointsByMarketId: {}, isLoading: false }),
  PRICE_HISTORY_WINDOWS: ['ALL'],
}));

// Archive mutation — never fired by the tests, just needs the surface.
vi.mock('@/features/admin/markets/useArchiveMarket', () => ({
  useArchiveMarket: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

// Force the mobile/overlay layout by default so the BetSlip mounts on outcome
// click rather than being auto-docked; individual tests flip this for the
// docked-default branch.
const mediaQueryMock = vi.fn(() => false);
vi.mock('@/shared/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mediaQueryMock(),
}));

// Lightweight BetSlip stub: surfaces the selected market/outcome ids so the
// deep-link preselect and docked-default branches are observable without the
// real slip's quote/CLOB machinery.
vi.mock('@/widgets/BetSlip', () => ({
  BETSLIP_DOCK_QUERY: '(min-width: 1024px)',
  BetSlip: ({ market, outcome }: { market: Market; outcome: MarketOutcome }) => (
    <div data-testid="betslip" data-market={market.id} data-outcome={outcome.id}>
      BetSlip stub
    </div>
  ),
}));

// --- Fixtures ------------------------------------------------------------

function outcome(name: string, price: number, id: string): MarketOutcome {
  return {
    id,
    name,
    price,
    odds: 1 / price,
    effective_odds: 1 / price,
    updated_at: '2026-06-20T12:00:00Z',
    polymarket_token_id: `tok-${id}`,
  };
}

const baseEvent: MarketEvent = {
  id: 'evt-1',
  title: 'Who will win the 2026 World Cup?',
  description: 'Resolves to the winning nation.',
  category: 'Sports',
  image_url: null,
  close_at: '2026-07-19T00:00:00Z',
  status: 'open',
  volume: 4_528_194,
  tag_slug: 'world-cup',
  tag_label: 'World Cup',
  tag_slugs: ['world-cup'],
};

function market(
  id: string,
  label: string,
  yesPrice: number,
  status: Market['status'] = 'open'
): Market {
  return {
    id,
    polymarket_id: `pm-${id}`,
    question: `${label}?`,
    status,
    winning_outcome_id: null,
    category: null,
    image_url: null,
    close_at: '2026-07-19T00:00:00Z',
    last_synced_at: null,
    created_at: '2026-06-01T00:00:00Z',
    volume: 1_000_000,
    event_id: 'evt-1',
    group_label: label,
    sports_market_type: null,
    line: null,
    event: baseEvent,
    market_outcomes: [outcome('Yes', yesPrice, `${id}-y`), outcome('No', 1 - yesPrice, `${id}-n`)],
  };
}

function multiMarketEvent(): EventWithMarkets {
  return {
    event: baseEvent,
    markets: [
      market('m-arg', 'Argentina', 0.32),
      market('m-fra', 'France', 0.18),
      market('m-bra', 'Brazil', 0.15),
    ],
  };
}

function singleMarketEvent(): EventWithMarkets {
  return {
    event: { ...baseEvent, title: 'Will it rain in London tomorrow?' },
    markets: [market('m-rain', 'Rain', 0.55)],
  };
}

const signedInUser: AuthContextValue = {
  user: { id: 'user-1' } as AuthContextValue['user'],
  session: null,
  profile: null,
  role: 'user',
  loading: false,
  signIn: async () => {},
  signOut: async () => {},
};

// EventDetailPage is the route component's default export.
async function loadPage() {
  const mod = await import('@/pages/user/EventDetailPage/EventDetailPage');
  return mod.default;
}

beforeEach(() => {
  eventByIdMock.mockReset();
  myBetsMock.mockReset();
  myBetsMock.mockReturnValue({ data: [] });
  userBalanceMock.mockReset();
  userBalanceMock.mockReturnValue({ data: { available: 250 } });
  similarEventsMock.mockReset();
  similarEventsMock.mockReturnValue({ data: [], isLoading: false });
  marketRefreshMock.mockReset();
  marketRefreshMock.mockReturnValue({ isRefreshing: false, lastResult: 'idle', refresh: vi.fn() });
  mediaQueryMock.mockReset();
  mediaQueryMock.mockReturnValue(false);
});

describe('EventDetailPage', () => {
  it('renders a spinner while the event is loading', async () => {
    eventByIdMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const EventDetailPage = await loadPage();

    const { container } = renderWithProviders(<EventDetailPage />, {
      initialRoute: '/events/evt-1',
      authValue: signedInUser,
    });

    // The loading branch renders only a centered <Spinner/>; no event title.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the load-error branch with a back link', async () => {
    eventByIdMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
    });
    const EventDetailPage = await loadPage();

    renderWithProviders(<EventDetailPage />, {
      initialRoute: '/events/evt-1',
      authValue: signedInUser,
    });

    // The error copy includes the error message; the back link is still shown.
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    const back = screen.getByRole('link');
    expect(back).toHaveAttribute('href', '/markets');
  });

  it('renders the event title and every market row for a multi-market event', async () => {
    eventByIdMock.mockReturnValue({
      data: multiMarketEvent(),
      isLoading: false,
      isError: false,
    });
    const EventDetailPage = await loadPage();

    renderWithProviders(<EventDetailPage />, {
      initialRoute: '/events/evt-1',
      authValue: signedInUser,
    });

    expect(
      screen.getByRole('heading', { level: 1, name: /who will win the 2026 world cup/i })
    ).toBeInTheDocument();
    // Each market's label appears at least once (it shows both in the market
    // row and the price-history chart legend), so assert presence via getAllByText.
    expect(screen.getAllByText('Argentina').length).toBeGreaterThan(0);
    expect(screen.getAllByText('France').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Brazil').length).toBeGreaterThan(0);
  });

  it('renders the meta-row as a muted, mixed-case dot breadcrumb (E5)', async () => {
    eventByIdMock.mockReturnValue({
      data: multiMarketEvent(),
      isLoading: false,
      isError: false,
    });
    const EventDetailPage = await loadPage();

    renderWithProviders(<EventDetailPage />, {
      initialRoute: '/events/evt-1',
      authValue: signedInUser,
    });

    // The category fixture is 'Sports'. Walk up to the meta-row container.
    const category = screen.getByText('Sports');
    const metaRow = category.closest('div.flex-wrap');
    expect(metaRow).not.toBeNull();
    // No uppercase/tracking — mixed-case breadcrumb.
    expect(metaRow?.className).not.toContain('uppercase');
    expect(metaRow?.className).not.toContain('tracking-wide');
    // At least one dot separator between items.
    expect(metaRow?.textContent).toContain('·');
    // The category renders as written (mixed-case, not SPORTS).
    expect(category.textContent).toBe('Sports');
  });

  it('renders the single-market view (rules text from the event description)', async () => {
    eventByIdMock.mockReturnValue({
      data: singleMarketEvent(),
      isLoading: false,
      isError: false,
    });
    const EventDetailPage = await loadPage();

    renderWithProviders(<EventDetailPage />, {
      initialRoute: '/events/evt-1',
      authValue: signedInUser,
    });

    expect(
      screen.getByRole('heading', { level: 1, name: /will it rain in london tomorrow/i })
    ).toBeInTheDocument();
    // SingleMarketView surfaces the event description as the Rules section.
    expect(screen.getByText(/resolves to the winning nation/i)).toBeInTheDocument();
    // E1: the binary detail shows the outcome ONCE via a compact row with the
    // Buy Yes/No pills (no repeated feed card). The pills carry the "Buy" CTA.
    expect(screen.getByRole('button', { name: /buy yes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy no/i })).toBeInTheDocument();
    // The inline Yes % (55% for the 0.55 Rain market) renders in the compact row.
    expect(screen.getByText('55%')).toBeInTheDocument();
    // E6: a binary event renders NO multi-outcome legend.
    expect(screen.queryByLabelText(/outcomes|תוצאות/i)).not.toBeInTheDocument();
  });

  it('renders the inline outcome legend for a multi-outcome event (E6)', async () => {
    eventByIdMock.mockReturnValue({
      data: multiMarketEvent(),
      isLoading: false,
      isError: false,
    });
    const EventDetailPage = await loadPage();

    renderWithProviders(<EventDetailPage />, {
      initialRoute: '/events/evt-1',
      authValue: signedInUser,
    });

    // The legend container is labelled by the eventDetail.outcomesLegend key.
    const legend = screen.getByLabelText(/outcomes|תוצאות/i);
    expect(legend).toBeInTheDocument();
    // Each of the three markets contributes a labelled entry inside the legend.
    expect(legend).toHaveTextContent('Argentina');
    expect(legend).toHaveTextContent('France');
    expect(legend).toHaveTextContent('Brazil');
  });

  it('does not auto-open the BetSlip without a deep-link on the overlay (non-desktop) layout', async () => {
    eventByIdMock.mockReturnValue({
      data: multiMarketEvent(),
      isLoading: false,
      isError: false,
    });
    const EventDetailPage = await loadPage();

    renderWithProviders(<EventDetailPage />, {
      initialRoute: '/events/evt-1',
      authValue: signedInUser,
    });

    expect(screen.queryByTestId('betslip')).not.toBeInTheDocument();
  });

  it('deep-link ?market= preselects that market and opens the BetSlip on its Yes outcome', async () => {
    eventByIdMock.mockReturnValue({
      data: multiMarketEvent(),
      isLoading: false,
      isError: false,
    });
    const EventDetailPage = await loadPage();

    renderWithProviders(<EventDetailPage />, {
      // France is not the top-sorted market — proves the slip follows the
      // ?market= param, not the default-selection logic.
      initialRoute: '/events/evt-1?market=m-fra',
      authValue: signedInUser,
    });

    const slip = await screen.findByTestId('betslip');
    expect(slip).toHaveAttribute('data-market', 'm-fra');
    // pickBettableOutcome prefers the Yes outcome.
    expect(slip).toHaveAttribute('data-outcome', 'm-fra-y');
  });

  it('ignores a ?market= that does not exist in the event (no slip)', async () => {
    eventByIdMock.mockReturnValue({
      data: multiMarketEvent(),
      isLoading: false,
      isError: false,
    });
    const EventDetailPage = await loadPage();

    renderWithProviders(<EventDetailPage />, {
      initialRoute: '/events/evt-1?market=does-not-exist',
      authValue: signedInUser,
    });

    expect(screen.queryByTestId('betslip')).not.toBeInTheDocument();
  });

  it('desktop docked column auto-selects the top market when there is no deep-link', async () => {
    mediaQueryMock.mockReturnValue(true); // simulate >= lg viewport (docked)
    eventByIdMock.mockReturnValue({
      data: multiMarketEvent(),
      isLoading: false,
      isError: false,
    });
    const EventDetailPage = await loadPage();

    renderWithProviders(<EventDetailPage />, {
      initialRoute: '/events/evt-1',
      authValue: signedInUser,
    });

    // sortMarketsByYesDesc puts Argentina (0.32) first; the docked default
    // selects its Yes outcome.
    const slip = await screen.findByTestId('betslip');
    expect(slip).toHaveAttribute('data-market', 'm-arg');
    expect(slip).toHaveAttribute('data-outcome', 'm-arg-y');
  });

  it('read-only mode hides the BetSlip even on desktop and links back to the admin markets list', async () => {
    mediaQueryMock.mockReturnValue(true);
    eventByIdMock.mockReturnValue({
      data: multiMarketEvent(),
      isLoading: false,
      isError: false,
    });
    const EventDetailPage = await loadPage();

    renderWithProviders(<EventDetailPage readonly />, {
      initialRoute: '/events/evt-1?market=m-arg',
      authValue: { ...signedInUser, role: 'super_admin' },
    });

    // No betting in read-only mode: the docked/overlay slip never mounts even
    // though a ?market= deep-link is present.
    expect(screen.queryByTestId('betslip')).not.toBeInTheDocument();
    // Back link is role-aware: super_admin → admin markets.
    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/markets');
  });
});
