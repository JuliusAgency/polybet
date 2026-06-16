import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Market, MarketOutcome } from '@/entities/market';
import type { MarketEvent } from '@/entities/event';
import { GamesList } from '@/widgets/GamesList';
import { groupGames, type WorldCupGame } from '@/features/bet';
import { renderWithProviders } from '../../helpers/render';

// Mirrors the live Polymarket "France vs. Senegal" Games card: a match event
// with three binary moneyline markets (team win / team win / draw).

function outcome(name: string, price: number, id: string): MarketOutcome {
  return {
    id,
    name,
    price,
    odds: 1 / price,
    effective_odds: 1 / price,
    updated_at: '2026-06-16T13:00:00Z',
    polymarket_token_id: `tok-${id}`,
  };
}

const event: MarketEvent = {
  id: 'evt-fra-sen',
  title: 'France vs. Senegal',
  description: null,
  category: null,
  image_url: null,
  close_at: '2026-06-16T19:00:00Z',
  status: 'open',
  volume: 4_528_194,
  tag_slug: 'world-cup',
  tag_label: 'World Cup',
  tag_slugs: ['world-cup'],
  game_start_time: '2026-06-16T19:00:00Z',
  sport: 'fifwc',
  teams: [
    {
      name: 'France',
      abbreviation: 'fra',
      logo: null,
      record: '0-0-0',
      color: '#144b8f',
      ordering: 'home',
    },
    {
      name: 'Senegal',
      abbreviation: 'sen',
      logo: null,
      record: '0-0-0',
      color: '#11733f',
      ordering: 'away',
    },
  ],
};

function market(
  id: string,
  groupLabel: string,
  yesPrice: number,
  sportsType = 'moneyline'
): Market {
  return {
    id,
    polymarket_id: `pm-${id}`,
    question: `${groupLabel}?`,
    status: 'open',
    winning_outcome_id: null,
    category: null,
    image_url: null,
    close_at: '2026-06-16T19:00:00Z',
    last_synced_at: null,
    created_at: '2026-06-16T13:00:00Z',
    event_id: 'evt-fra-sen',
    group_label: groupLabel,
    sports_market_type: sportsType,
    line: null,
    event,
    market_outcomes: [outcome('Yes', yesPrice, `${id}-y`), outcome('No', 1 - yesPrice, `${id}-n`)],
  };
}

function buildGame(): WorldCupGame {
  // Use groupGames so the test exercises the real grouping logic too.
  return groupGames([
    market('m-fra', 'France', 0.665),
    market('m-draw', 'Draw (France vs. Senegal)', 0.215),
    market('m-sen', 'Senegal', 0.125),
  ])[0];
}

describe('GamesList', () => {
  it('renders team rows with moneyline prices in cents and a draw chip', () => {
    renderWithProviders(
      <GamesList games={[buildGame()]} isLoading={false} isError={false} onOutcomeClick={vi.fn()} />
    );

    expect(screen.getByText('France')).toBeInTheDocument();
    expect(screen.getByText('Senegal')).toBeInTheDocument();
    // 0.665 -> 67¢, 0.125 -> 13¢ (rounded to whole cents), 0.215 -> 22¢.
    expect(screen.getByText('67¢')).toBeInTheDocument();
    expect(screen.getByText('13¢')).toBeInTheDocument();
    expect(screen.getByText('22¢')).toBeInTheDocument();
  });

  it('invokes onOutcomeClick with the correct market + Yes outcome', async () => {
    const onOutcomeClick = vi.fn();
    renderWithProviders(
      <GamesList
        games={[buildGame()]}
        isLoading={false}
        isError={false}
        onOutcomeClick={onOutcomeClick}
      />
    );

    await userEvent.click(screen.getByText('67¢'));
    expect(onOutcomeClick).toHaveBeenCalledTimes(1);
    const [clickedMarket, clickedOutcome] = onOutcomeClick.mock.calls[0];
    expect(clickedMarket.id).toBe('m-fra');
    expect(clickedOutcome.name).toBe('Yes');
  });

  it('shows a date header grouping the games by kickoff day', () => {
    renderWithProviders(
      <GamesList games={[buildGame()]} isLoading={false} isError={false} onOutcomeClick={vi.fn()} />
    );
    // en-US weekday/long-month/day header for 2026-06-16.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('June');
  });

  it('renders the empty state when there are no games', () => {
    renderWithProviders(
      <GamesList games={[]} isLoading={false} isError={false} onOutcomeClick={vi.fn()} />
    );
    expect(screen.getByText(/no games scheduled/i)).toBeInTheDocument();
  });

  it('renders the error state', () => {
    renderWithProviders(
      <GamesList games={[]} isLoading={false} isError onOutcomeClick={vi.fn()} />
    );
    expect(screen.getByText(/couldn't load games/i)).toBeInTheDocument();
  });

  it('links Order Book to the event detail page', () => {
    renderWithProviders(
      <GamesList games={[buildGame()]} isLoading={false} isError={false} onOutcomeClick={vi.fn()} />
    );
    const link = screen.getByRole('link', { name: /order book/i });
    expect(link).toHaveAttribute('href', '/events/evt-fra-sen');
  });
});

describe('groupGames', () => {
  it('splits markets by sports_market_type and orders games by kickoff', () => {
    const later = { ...event, id: 'evt-late', game_start_time: '2026-06-17T19:00:00Z' };
    const lateMarket: Market = {
      ...market('m-late', 'France', 0.5),
      event_id: 'evt-late',
      event: later,
    };

    const games = groupGames([
      lateMarket,
      market('m-fra', 'France', 0.665),
      market('m-draw', 'Draw (France vs. Senegal)', 0.215),
      market('m-sen', 'Senegal', 0.125),
    ]);

    expect(games.map((g) => g.event.id)).toEqual(['evt-fra-sen', 'evt-late']);
    const first = games[0];
    expect(first.moneyline).toHaveLength(3);
    expect(first.spread).toHaveLength(0);
    expect(first.total).toHaveLength(0);
  });
});
