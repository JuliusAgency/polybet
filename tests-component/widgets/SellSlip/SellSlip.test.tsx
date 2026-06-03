import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Position } from '@/entities/position';
import type { SellQuote } from '@/features/bet';
import { SellSlip } from '@/widgets/SellSlip';
import { renderWithProviders } from '../../helpers/render';

// Module-scoped RPC mock so each test can re-program sell_position's response.
const rpcMock = vi.fn();
vi.mock('@/shared/api/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

// Mock useSellQuote (the live bid quote) to drive the slip deterministically;
// keep useSellPosition / PriceDriftError real so the P0002 mapping is exercised.
// SellForm imports useSellQuote from its sibling module, so mock that module
// directly (not the barrel) to intercept the relative import.
const quoteMock = vi.fn();
vi.mock('@/features/bet/useSellQuote', () => ({
  useSellQuote: (...args: unknown[]) => quoteMock(...args),
}));

const FRESH_BOOK_AT = '2026-06-02T00:00:00.000Z';

/** A fully-fillable bid quote: 100 shares → $50 at avg 0.5, no partial. */
function sellQuote(overrides: Partial<SellQuote> = {}): { data: SellQuote; isFetching: boolean } {
  return {
    data: {
      proceeds: 50,
      filled_shares: 100,
      avg_price: 0.5,
      partial: false,
      book_updated_at: FRESH_BOOK_AT,
      available_shares: 1000,
      ...overrides,
    },
    isFetching: false,
  };
}

/** A position holding 100 shares bought at avg 0.40 (cost basis 40). */
function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    market_id: 'mk-1',
    outcome_id: 'out-yes',
    shares: 100,
    avg_price: 0.4,
    cost_basis: 40,
    realized_pnl: 0,
    status: 'open',
    opened_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    settled_at: null,
    markets: {
      question: 'Will it rain tomorrow?',
      status: 'open',
      winning_outcome_id: null,
      last_synced_at: new Date().toISOString(),
      event_id: 'evt-1',
    },
    market_outcomes: { name: 'Yes', polymarket_token_id: 'tok-yes', price: 0.5 },
    ...overrides,
  };
}

describe('SellSlip', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    quoteMock.mockReset();
    quoteMock.mockReturnValue(sellQuote());
  });

  it('shows proceeds and realized P/L from the live bid quote', async () => {
    renderWithProviders(<SellSlip position={makePosition()} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText(/shares to sell/i), '100');

    // Proceeds = $50.00; realized = 50 − 100*0.40 = +10.00.
    expect(screen.getByText(/\$50\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\+10\.00/)).toBeInTheDocument();
  });

  it('Max fills the full held share count', async () => {
    renderWithProviders(<SellSlip position={makePosition()} onClose={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /max/i }));

    expect(screen.getByLabelText(/shares to sell/i)).toHaveValue('100');
  });

  it('sends sell_position with the position id, shares and expected price', async () => {
    rpcMock.mockResolvedValueOnce({ data: { status: 'closed' }, error: null });
    renderWithProviders(<SellSlip position={makePosition()} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText(/shares to sell/i), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Sell' }));

    await vi.waitFor(() => {
      expect(rpcMock).toHaveBeenCalled();
    });
    expect(rpcMock).toHaveBeenCalledWith('sell_position', {
      p_position_id: 'pos-1',
      p_shares: 100,
      p_expected_price: 0.5,
    });
  });

  it('disables Sell and warns when the bid quote is unavailable', async () => {
    quoteMock.mockReturnValue(sellQuote({ book_updated_at: null, available_shares: null }));
    renderWithProviders(<SellSlip position={makePosition()} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText(/shares to sell/i), '100');

    expect(screen.getByText(/sell quote unavailable|אינה זמינה/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sell' })).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects overselling more than held', async () => {
    renderWithProviders(<SellSlip position={makePosition()} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText(/shares to sell/i), '150');

    expect(screen.getByText(/more than you hold|יותר ממה שברשותך/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sell' })).toBeDisabled();
  });

  it('surfaces the drift error when sell_position rejects with P0002', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0002', message: 'Price changed (expected 0.50, actual 0.45)' },
    });
    renderWithProviders(<SellSlip position={makePosition()} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText(/shares to sell/i), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Sell' }));

    await vi.waitFor(() => {
      expect(screen.getByText(/price changed|המחיר השתנה/i)).toBeInTheDocument();
    });
  });
});
