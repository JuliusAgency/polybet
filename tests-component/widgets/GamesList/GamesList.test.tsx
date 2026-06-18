import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Market, MarketOutcome } from '@/entities/market';
import type { MarketEvent } from '@/entities/event';
import { GamesList } from '@/widgets/GamesList';
import { readableTextColor, toGameView } from '@/widgets/GamesList/helpers';
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
  it('renders team rows with moneyline prices in cents and a draw button', () => {
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

  it('renders the three moneyline bet buttons (win / draw / loss)', () => {
    renderWithProviders(
      <GamesList games={[buildGame()]} isLoading={false} isError={false} onOutcomeClick={vi.fn()} />
    );

    const buttons = screen.getAllByRole('button');
    // FRA win, Draw, SEN win — exactly three bettable outcomes, no spread/total.
    expect(buttons).toHaveLength(3);
    expect(screen.getByRole('button', { name: /fra/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /draw/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sen/i })).toBeInTheDocument();
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
  it('groups moneyline markets per event and orders games by kickoff', () => {
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
    expect(games[0].moneyline).toHaveLength(3);
  });
});

describe('toGameView', () => {
  // Real Polymarket data: the event names the team "Bosnia and Herzegovina"
  // while its market label is "Bosnia-Herzegovina". The team slot must still
  // resolve, and the draw chip must show the actual draw market (not Bosnia's).
  function buildSwissBosniaGame(): WorldCupGame {
    const swissBosniaEvent: MarketEvent = {
      ...event,
      id: 'evt-che-bih',
      title: 'Switzerland vs. Bosnia-Herzegovina',
      teams: [
        {
          name: 'Switzerland',
          abbreviation: 'che',
          logo: null,
          record: '0-1-0',
          color: '#c02121',
          ordering: 'home',
        },
        {
          name: 'Bosnia and Herzegovina',
          abbreviation: 'bih',
          logo: null,
          record: '0-1-0',
          color: '#1b42c0',
          ordering: 'away',
        },
      ],
    };
    const mk = (id: string, groupLabel: string, yesPrice: number): Market => ({
      ...market(id, groupLabel, yesPrice),
      event_id: 'evt-che-bih',
      event: swissBosniaEvent,
    });
    return groupGames([
      mk('m-che', 'Switzerland', 0.625),
      mk('m-bih', 'Bosnia-Herzegovina', 0.145),
      mk('m-draw', 'Draw (Switzerland vs. Bosnia-Herzegovina)', 0.235),
    ])[0];
  }

  it('matches a team to its market despite "and" vs "-" label differences', () => {
    const view = toGameView(buildSwissBosniaGame());

    const byTeam = Object.fromEntries(view.teamSlots.map((s) => [s.team.abbreviation, s]));
    expect(byTeam.che.market?.id).toBe('m-che');
    expect(byTeam.che.outcome?.price).toBe(0.625);
    // The bug: Bosnia rendered "—" because its slot found no market.
    expect(byTeam.bih.market?.id).toBe('m-bih');
    expect(byTeam.bih.outcome?.price).toBe(0.145);
  });

  it('binds the draw chip to the labelled draw market, not the unmatched team market', () => {
    const view = toGameView(buildSwissBosniaGame());
    expect(view.draw?.market.id).toBe('m-draw');
    expect(view.draw?.outcome.price).toBe(0.235);
  });
});

describe('readableTextColor', () => {
  it('returns light text on dark backgrounds and dark text on light ones', () => {
    expect(readableTextColor('#144b8f')).toBe('#ffffff'); // dark navy -> light text
    expect(readableTextColor('#f5d90a')).toBe('#0b0b0c'); // bright yellow -> dark text
    expect(readableTextColor('#fff')).toBe('#0b0b0c'); // short hex supported
  });

  it('falls back to the on-accent token for missing or invalid colours', () => {
    expect(readableTextColor(null)).toBe('var(--color-bg-base)');
    expect(readableTextColor('not-a-color')).toBe('var(--color-bg-base)');
  });
});
