import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Market, MarketOutcome } from '@/entities/market';
import type { MarketEvent } from '@/entities/event';
import { EventCard } from '@/widgets/EventCard';
import { renderWithProviders } from '../helpers/render';

// Polymarket parity contract:
// every outcome with a Polymarket CLOB token stays clickable, across the full
// (0, 1) price band. The old isOutcomeTradable price floor (0.001) and
// ceiling (< 1) used to dim Yes/No pills for long-tail candidates — that
// broke parity with Polymarket which keeps both sides live. After the QA
// fix the only thing that disables a side is the absence of a CLOB token.

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

function outcome(
  name: string,
  price: number,
  id = name.toLowerCase(),
  tokenId: string | null = `tok-${id}`
): MarketOutcome {
  return {
    id,
    name,
    price,
    odds: 1 / price,
    effective_odds: 1 / price,
    updated_at: new Date().toISOString(),
    polymarket_token_id: tokenId,
  };
}

function market(
  id: string,
  question: string,
  yesPrice: number,
  groupLabel: string,
  yesTokenId: string | null = `tok-${id}-yes`
): Market {
  const yes = outcome('Yes', yesPrice, `${id}-yes`, yesTokenId);
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

describe('EventCard — Polymarket parity (no price floor)', () => {
  // Mid-market candidate: both Yes and No prices are well inside (0, 1).
  // Buttons render as real <button> elements that fire onClick.
  const tradable = market('tradable', 'Tradable Candidate', 0.45, 'Tradable Candidate');
  // Sub-cent candidate: Yes at 0.5¢. Pre-fix this was already inside the
  // (0.001, 1) band; post-fix the band has no floor at all but the
  // expectation is unchanged.
  const subCent = market('subcent', 'Sub-cent Candidate', 0.005, 'Sub-cent Candidate');
  // Deep-floor candidate: Yes at 0.05¢ (below the legacy 0.001 floor).
  // This used to render as aria-disabled. Polymarket parity: it must
  // remain a clickable button.
  const deepFloor = market('floor', 'Floor Candidate', 0.0005, 'Floor Candidate');
  // No-token candidate: Yes has polymarket_token_id = null. This IS the
  // only case that still renders as non-interactive (new contract).
  const noToken = market('notoken', 'Untracked Candidate', 0.45, 'Untracked Candidate', null);

  it('renders sub-tenth-cent Yes side as a clickable <button> (regression: 2026-05-20 QA)', async () => {
    // The bug: Yes at 0.05¢ displayed as "Buy Yes 0.1¢" (formatPrice rounds)
    // but the button was a dead aria-disabled div because price < 0.001
    // tripped the old isOutcomeTradable floor.
    const onOutcomeClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EventCard event={event} markets={[tradable, deepFloor]} onOutcomeClick={onOutcomeClick} />
    );

    const row = findRow('Floor Candidate');
    const yesBtn = within(row).getByRole('button', { name: /yes/i });
    await user.click(yesBtn);

    expect(onOutcomeClick).toHaveBeenCalledTimes(1);
    const [clickedMarket, clickedOutcome] = onOutcomeClick.mock.calls[0];
    expect(clickedMarket.id).toBe('floor');
    expect(clickedOutcome.name).toBe('Yes');
  });

  it('keeps the No side clickable when its price is at the ceiling (≥ 99.9¢)', () => {
    // No price = 1 - 0.0005 = 0.9995. Old ceiling (< 1) blocked this;
    // Polymarket parity keeps it live.
    const onOutcomeClick = vi.fn();
    renderWithProviders(
      <EventCard event={event} markets={[tradable, deepFloor]} onOutcomeClick={onOutcomeClick} />
    );

    const row = findRow('Floor Candidate');
    expect(within(row).getByRole('button', { name: /no/i })).toBeInTheDocument();
  });

  it('fires onOutcomeClick when clicking the mid-band Yes side', async () => {
    const onOutcomeClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EventCard event={event} markets={[tradable, deepFloor]} onOutcomeClick={onOutcomeClick} />
    );

    const row = findRow('Tradable Candidate');
    const yesBtn = within(row).getByRole('button', { name: /yes/i });
    await user.click(yesBtn);

    expect(onOutcomeClick).toHaveBeenCalledTimes(1);
    const [clickedMarket, clickedOutcome] = onOutcomeClick.mock.calls[0];
    expect(clickedMarket.id).toBe('tradable');
    expect(clickedOutcome.name).toBe('Yes');
  });

  it('keeps sub-cent Yes side clickable (Polymarket parity)', async () => {
    const onOutcomeClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EventCard event={event} markets={[tradable, subCent]} onOutcomeClick={onOutcomeClick} />
    );

    const row = findRow('Sub-cent Candidate');
    const yesBtn = within(row).getByRole('button', { name: /yes/i });
    await user.click(yesBtn);

    expect(onOutcomeClick).toHaveBeenCalledTimes(1);
    const [, clickedOutcome] = onOutcomeClick.mock.calls[0];
    expect(clickedOutcome.name).toBe('Yes');
    expect(within(row).getByRole('button', { name: /no/i })).toBeInTheDocument();
  });

  it('renders Yes side as aria-disabled (not a button) when polymarket_token_id is null', () => {
    // The ONLY case that still disables a side in the new contract: the
    // outcome has no CLOB token at all — there is no way to fill any stake.
    renderWithProviders(<EventCard event={event} markets={[tradable, noToken]} />);

    const row = findRow('Untracked Candidate');
    expect(within(row).queryByRole('button', { name: /yes/i })).toBeNull();
    expect(within(row).getByText(/yes/i).closest('[aria-disabled="true"]')).not.toBeNull();
  });
});
