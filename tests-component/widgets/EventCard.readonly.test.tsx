import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { Market, MarketOutcome } from '@/entities/market';
import type { MarketEvent } from '@/entities/event';
import { EventCard } from '@/widgets/EventCard';
import { renderWithProviders } from '../helpers/render';

// Bugs 1+2+3 contract for the admin/manager read-only Markets surface:
//  - the card click target is overridable via `detailHref` so it opens the
//    role-scoped detail route (NOT the user `/events/:id`, which the RoleGuard
//    would bounce to the Dashboard), and
//  - `mode="readonly" outcomeAppearance="inactive"` makes every outcome
//    non-bettable (no <button>) and visually switched off.

const event: MarketEvent = {
  id: 'evt-1',
  title: 'FIFA World Cup 2026',
  description: null,
  category: 'Sports',
  image_url: null,
  close_at: null,
  status: 'open',
  volume: 12_000_000,
  tag_slug: 'sports',
  tag_label: 'Sports',
  tag_slugs: ['sports'],
};

function outcome(name: string, price: number, id: string): MarketOutcome {
  return {
    id,
    name,
    price,
    odds: 1 / price,
    effective_odds: 1 / price,
    updated_at: new Date().toISOString(),
    polymarket_token_id: `tok-${id}`,
  };
}

function market(id: string, label: string, yesPrice: number): Market {
  return {
    id,
    polymarket_id: `pm-${id}`,
    question: label,
    status: 'open',
    winning_outcome_id: null,
    category: 'Sports',
    image_url: null,
    close_at: null,
    last_synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    volume: 1_000_000,
    sort_volume: 1_000_000,
    event_id: event.id,
    group_label: label,
    tag_slugs: ['sports'],
    event,
    market_outcomes: [
      outcome('Yes', yesPrice, `${id}-yes`),
      outcome('No', 1 - yesPrice, `${id}-no`),
    ],
  };
}

const markets = [market('turkey', 'Turkey', 0.12), market('czechia', 'Czechia', 0.09)];

describe('EventCard — read-only admin/manager surface', () => {
  it('points the card click target at the role-scoped detail path', () => {
    renderWithProviders(
      <EventCard
        event={event}
        markets={markets}
        mode="readonly"
        outcomeAppearance="inactive"
        detailHref="/admin/markets/evt-1"
      />
    );

    expect(screen.getByRole('link').getAttribute('href')).toBe('/admin/markets/evt-1');
  });

  it('renders outcomes as non-bettable (no Yes/No buttons, muted pills)', () => {
    renderWithProviders(
      <EventCard
        event={event}
        markets={markets}
        mode="readonly"
        outcomeAppearance="inactive"
        detailHref="/admin/markets/evt-1"
      />
    );

    // No bettable outcome buttons exist on the read-only card.
    expect(screen.queryByRole('button', { name: /yes/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /no/i })).toBeNull();

    // Outcome pills are switched off (muted + cursor-not-allowed).
    const pill = screen.getAllByText('Yes')[0].closest('div.rounded-lg');
    expect(pill).not.toBeNull();
    expect(pill?.className).toContain('cursor-not-allowed');
    expect(pill?.getAttribute('style')).toContain('--color-text-muted');
  });

  it('falls back to /events/:id when no detailHref is passed (user feed unchanged)', () => {
    renderWithProviders(<EventCard event={event} markets={markets} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/events/evt-1');
  });
});
