import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Market, MarketOutcome } from '@/entities/market';
import type { MarketEvent } from '@/entities/event';
import { EventCard } from '@/widgets/EventCard';
import { renderWithProviders } from '../helpers/render';

// Regression coverage for the floor-price tradability bug:
// on the trending feed the EventCard rendered Yes/No buttons for long-tail
// candidates (e.g. Yes at 0.3¢) as fully active. Clicking opened BetSlip,
// which then surfaced "no longer tradable" — UI/state mismatch.
// MarketCard already filtered these via isOutcomeTradable; EventCard did
// not. Tests below pin the contract for both render branches.

const event: MarketEvent = {
  id: 'evt-1',
  title: 'Who will be confirmed as Fed Chair?',
  description: null,
  category: 'Politics',
  image_url: null,
  close_at: null,
  status: 'open',
  volume: 53_700_000,
  tag_slug: 'politics',
  tag_label: 'Politics',
  tag_slugs: ['politics'],
};

function outcome(name: string, price: number, id = name.toLowerCase()): MarketOutcome {
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

function market(id: string, question: string, yesPrice: number, groupLabel: string): Market {
  const yes = outcome('Yes', yesPrice, `${id}-yes`);
  const no = outcome('No', 1 - yesPrice, `${id}-no`);
  return {
    id,
    polymarket_id: `pm-${id}`,
    question,
    status: 'open',
    winning_outcome_id: null,
    category: 'Politics',
    image_url: null,
    close_at: null,
    last_synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    volume: 1_000_000,
    sort_volume: 1_000_000,
    event_id: event.id,
    group_label: groupLabel,
    tag_slugs: ['politics'],
    event,
    market_outcomes: [yes, no],
  };
}

function findRow(label: string): HTMLElement {
  const labelEl = screen.getByText(label);
  const row = labelEl.closest('div.flex.items-center');
  if (!row) throw new Error(`Could not locate row for "${label}"`);
  return row as HTMLElement;
}

describe('EventCard — tradability gating on multi-row body', () => {
  // Mid-market candidate: both Yes and No prices are inside the tradable
  // band, so the buttons render as real <button> elements that fire onClick.
  const tradable = market('tradable', 'Tradable Candidate', 0.45, 'Tradable Candidate');
  // Floor candidate: Yes price 0.003 < MIN_TRADABLE_PRICE (0.01), so the
  // Yes side must render as a non-interactive aria-disabled div. This is
  // the exact shape that caused the original feed-card bug.
  const floor = market('floor', 'Floor Candidate', 0.003, 'Floor Candidate');

  it('renders Yes side as aria-disabled (not a button) when price is at the floor', () => {
    renderWithProviders(<EventCard event={event} markets={[tradable, floor]} />);

    const row = findRow('Floor Candidate');
    // The disabled Yes side: present in the DOM, marked aria-disabled, and
    // crucially NOT exposed as a button — so a click cannot reach BetSlip.
    expect(within(row).queryByRole('button', { name: /yes/i })).toBeNull();
    expect(within(row).getByText(/yes/i).closest('[aria-disabled="true"]')).not.toBeNull();
  });

  it('fires onOutcomeClick when clicking the tradable Yes side', async () => {
    const onOutcomeClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EventCard event={event} markets={[tradable, floor]} onOutcomeClick={onOutcomeClick} />
    );

    const row = findRow('Tradable Candidate');
    const yesBtn = within(row).getByRole('button', { name: /yes/i });
    await user.click(yesBtn);

    expect(onOutcomeClick).toHaveBeenCalledTimes(1);
    const [clickedMarket, clickedOutcome] = onOutcomeClick.mock.calls[0];
    expect(clickedMarket.id).toBe('tradable');
    expect(clickedOutcome.name).toBe('Yes');
  });

  it('disables BOTH sides for a long-tail candidate (Yes at floor, No at ceiling)', () => {
    // When Yes = 0.3¢ the complementary No = 99.7¢ — both prices land outside
    // the tradable band [0.01, 0.99]. The whole row becomes non-interactive
    // by design: there is no liquid side to bet on. This is the exact
    // behaviour the BetSlip then surfaces if the gate is bypassed.
    renderWithProviders(<EventCard event={event} markets={[tradable, floor]} />);

    const row = findRow('Floor Candidate');
    expect(within(row).queryByRole('button', { name: /yes/i })).toBeNull();
    expect(within(row).queryByRole('button', { name: /no/i })).toBeNull();
  });
});
