import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdjustBalanceModal } from '@/features/manager/balance';
import { renderWithProviders } from '../helpers/render';

// Coverage for the withdrawal Max UX added with the full-balance clamp
// (migration 20260611170133): the modal shows the available balance, the Max
// button fills it, and client-side validation rejects clearly-over-max input
// while allowing the <= 0.01 display-rounding tolerance the RPC clamps.

// Module-scoped RPC mock (same pattern as SellSlip.test.tsx): the stubbed
// anon key is not a real JWT, so going through MSW would fail inside
// supabase-js before any request is made.
const rpcMock = vi.fn();
vi.mock('@/shared/api/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

function renderModal(props: Partial<Parameters<typeof AdjustBalanceModal>[0]> = {}) {
  return renderWithProviders(
    <AdjustBalanceModal
      isOpen
      onClose={() => {}}
      userId="u1"
      username="user1"
      type="withdrawal"
      available={1200}
      {...props}
    />
  );
}

describe('AdjustBalanceModal (withdrawal Max UX)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it('Max fills the input with the displayed available amount', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Max' }));

    expect(screen.getByLabelText(/amount/i)).toHaveValue(1200);
    expect(screen.getByText('Available: 1200.00')).toBeInTheDocument();
  });

  it('rejects an amount above available + tolerance without calling the RPC', async () => {
    renderModal();

    await userEvent.type(screen.getByLabelText(/amount/i), '1300');
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));

    expect(screen.getByText(/exceeds available balance \(1200\.00\)/i)).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('submits an amount within the display-rounding tolerance (RPC clamps it)', async () => {
    renderModal();

    // 1200.01 = available + exactly the 0.01 tolerance — must pass client
    // validation and reach the RPC (which clamps to the true balance).
    await userEvent.type(screen.getByLabelText(/amount/i), '1200.01');
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));

    await vi.waitFor(() => {
      expect(rpcMock).toHaveBeenCalled();
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'manager_adjust_balance',
      expect.objectContaining({ p_amount: 1200.01, p_type: 'withdrawal' })
    );
  });

  it('submits the Max-filled (display-rounded) amount', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Max' }));
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));

    await vi.waitFor(() => {
      expect(rpcMock).toHaveBeenCalled();
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'manager_adjust_balance',
      expect.objectContaining({ p_amount: 1200, p_type: 'withdrawal' })
    );
  });

  it('renders no hint or Max button for deposits', () => {
    renderModal({ type: 'deposit' });

    expect(screen.queryByRole('button', { name: 'Max' })).not.toBeInTheDocument();
    expect(screen.queryByText(/available:/i)).not.toBeInTheDocument();
  });

  it('renders no hint or Max button when available is not provided', () => {
    renderModal({ available: undefined });

    expect(screen.queryByRole('button', { name: 'Max' })).not.toBeInTheDocument();
    expect(screen.queryByText(/available:/i)).not.toBeInTheDocument();
  });
});
