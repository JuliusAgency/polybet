import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { Position } from '@/entities/position';
import { renderWithProviders } from '../../helpers/render';

// Phase-6 A2: the portfolio summary band reflows from a flex-wrap row to a 2×2
// grid on mobile (4-up on desktop). All four KPIs stay; we assert the labels
// render and the container carries the grid classes. usePositions /
// usePositionHistory are mocked so the page renders without the network.
const positionsMock = vi.fn(() => ({ data: [] as Position[], isLoading: false }));
const historyMock = vi.fn(() => ({ data: [] as Position[], isLoading: false }));

vi.mock('@/features/bet', () => ({
  usePositions: () => positionsMock(),
  usePositionHistory: () => historyMock(),
}));

// SellSlip is only mounted when a position is being sold — stub it out.
vi.mock('@/widgets/SellSlip', () => ({
  SellSlip: () => null,
}));

import MyBetsPage from '@/pages/user/MyBetsPage/MyBetsPage';

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    market_id: 'mk-1',
    outcome_id: 'out-yes',
    shares: 10,
    avg_price: 0.5,
    cost_basis: 5,
    realized_pnl: 0,
    status: 'open',
    opened_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    settled_at: null,
    markets: {
      question: 'Will it rain?',
      status: 'open',
      winning_outcome_id: null,
      last_synced_at: new Date().toISOString(),
      event_id: 'evt-1',
    },
    market_outcomes: { name: 'Yes', polymarket_token_id: 'tok-yes', price: 0.6 },
    ...overrides,
  };
}

describe('MyBetsPage — portfolio summary 2×2 grid (A2)', () => {
  it('renders all four KPI labels inside a grid container', () => {
    positionsMock.mockReturnValue({ data: [makePosition()], isLoading: false });
    historyMock.mockReturnValue({ data: [], isLoading: false });

    renderWithProviders(<MyBetsPage />);

    const openValue = screen.getByText('Open value');
    expect(openValue).toBeInTheDocument();
    expect(screen.getByText('Cost basis')).toBeInTheDocument();
    expect(screen.getByText('Unrealized P/L')).toBeInTheDocument();
    expect(screen.getByText('Realized P/L')).toBeInTheDocument();

    // Walk up to the summary band container and assert the responsive grid.
    const band = openValue.closest('.grid');
    expect(band).not.toBeNull();
    expect(band?.className).toContain('grid-cols-2');
    expect(band?.className).toContain('sm:grid-cols-4');
    // The old flex-wrap layout must be gone.
    expect(band?.className).not.toContain('flex-wrap');
  });

  it('still renders the four KPIs when there are no positions', () => {
    positionsMock.mockReturnValue({ data: [], isLoading: false });
    historyMock.mockReturnValue({ data: [], isLoading: false });

    renderWithProviders(<MyBetsPage />);

    expect(screen.getByText('Open value')).toBeInTheDocument();
    expect(screen.getByText('Realized P/L')).toBeInTheDocument();
  });
});
