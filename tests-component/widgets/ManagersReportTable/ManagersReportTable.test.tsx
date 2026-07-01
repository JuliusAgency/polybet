import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';

// The widget reads per-manager deposit / withdrawal / profit rows plus the
// server-computed totals from the `admin_get_report_dataset` RPC, coerces them
// with Number() (PostgREST RPCs commonly return numerics as strings) and
// renders each row plus a footer totals row.
//
// We mock the shared Supabase client's rpc (matching the BetSlip /
// AdjustBalanceModal test convention) so the real hook fetch+coerce+render path
// runs against in-memory data without supabase-js rejecting the test apikey.

const rpcMock = vi.fn();

vi.mock('@/shared/api/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { ManagersReportTable } from '@/widgets/ManagersReportTable';
import type { AdminReportFilters } from '@/features/admin/reports';
import { renderWithProviders } from '../../helpers/render';

interface RpcRow {
  manager_id: string;
  manager_username: string;
  manager_full_name: string | null;
  deposits: number | string;
  withdrawals: number | string;
  profit: number | string;
}

interface RpcTotals {
  deposits: number | string;
  withdrawals: number | string;
  profit: number | string;
}

// The hook unwraps `data.data.{rows,totals}`.
const respondWith = (rows: RpcRow[], totals: RpcTotals) => {
  rpcMock.mockResolvedValue({ data: { data: { rows, totals } }, error: null });
};

const respondError = (message: string) => {
  rpcMock.mockResolvedValue({ data: null, error: { message } });
};

const freshClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

const FILTERS: AdminReportFilters = { started_at: undefined, ended_at: undefined };

const renderTable = () =>
  renderWithProviders(<ManagersReportTable filters={FILTERS} />, { queryClient: freshClient() });

beforeEach(() => {
  rpcMock.mockReset();
});

describe('ManagersReportTable', () => {
  it('renders each manager row with deposits, withdrawals and signed profit', async () => {
    respondWith(
      [
        {
          manager_id: 'm1',
          manager_username: 'mgr_one',
          manager_full_name: 'Manager One',
          deposits: 1000,
          withdrawals: 400,
          profit: 600,
        },
        {
          manager_id: 'm2',
          manager_username: 'mgr_two',
          manager_full_name: 'Manager Two',
          deposits: 200,
          withdrawals: 500,
          profit: -300,
        },
      ],
      { deposits: 1200, withdrawals: 900, profit: 300 }
    );

    renderTable();

    // Widget renders a mobile card list AND the desktop table (jsdom shows both),
    // so each value appears twice; scope to the <table> to disambiguate.
    // getAllByRole('row') only returns table <tr>s (cards are <div>s).
    // TableSkeleton also renders a (headerless) <table> while loading, so wait
    // on a columnheader — only the real data table has <th>s.
    await waitFor(() => expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0));
    const table = within(screen.getByRole('table'));

    const rows = screen.getAllByRole('row');
    // header + 2 body rows + footer total row
    expect(rows).toHaveLength(4);

    const row1 = within(table.getByText('Manager One').closest('tr') as HTMLElement);
    expect(row1.getByText('1000.00')).toBeInTheDocument();
    expect(row1.getByText('400.00')).toBeInTheDocument();
    // Positive profit gets a leading '+'.
    expect(row1.getByText('+600.00')).toBeInTheDocument();

    const row2 = within(table.getByText('Manager Two').closest('tr') as HTMLElement);
    expect(row2.getByText('200.00')).toBeInTheDocument();
    expect(row2.getByText('500.00')).toBeInTheDocument();
    // Negative profit keeps its own '-' and gets no '+'.
    expect(row2.getByText('-300.00')).toBeInTheDocument();
  });

  it('renders the server-computed totals in the footer row', async () => {
    respondWith(
      [
        {
          manager_id: 'm1',
          manager_username: 'mgr_one',
          manager_full_name: 'Manager One',
          deposits: 1000,
          withdrawals: 400,
          profit: 600,
        },
        {
          manager_id: 'm2',
          manager_username: 'mgr_two',
          manager_full_name: 'Manager Two',
          deposits: 200,
          withdrawals: 500,
          profit: -300,
        },
      ],
      { deposits: 1200, withdrawals: 900, profit: 300 }
    );

    renderTable();

    // TableSkeleton also renders a (headerless) <table> while loading, so wait
    // on a columnheader — only the real data table has <th>s.
    await waitFor(() => expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0));

    // The footer "Total" row carries the aggregate deposits/withdrawals/profit.
    // Scope to the table — the mobile card list also renders a "Total" summary.
    const totalRow = within(screen.getByRole('table')).getByText('Total').closest('tr');
    expect(totalRow).not.toBeNull();
    const total = within(totalRow as HTMLElement);
    expect(total.getByText('1200.00')).toBeInTheDocument();
    expect(total.getByText('900.00')).toBeInTheDocument();
    expect(total.getByText('+300.00')).toBeInTheDocument();
  });

  it('coerces string numerics from the RPC and formats them to two decimals', async () => {
    // PostgREST returns numeric/decimal columns as JSON strings. The hook must
    // Number()-coerce them before .toFixed runs, otherwise "1500.5" would render
    // raw and "+" would string-concat.
    respondWith(
      [
        {
          manager_id: 'm1',
          manager_username: 'mgr_one',
          manager_full_name: 'Manager One',
          deposits: '1500.5',
          withdrawals: '250.25',
          profit: '1250.25',
        },
      ],
      { deposits: '1500.5', withdrawals: '250.25', profit: '1250.25' }
    );

    renderTable();

    // TableSkeleton also renders a (headerless) <table> while loading, so wait
    // on a columnheader — only the real data table has <th>s.
    await waitFor(() => expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0));
    const table = within(screen.getByRole('table'));

    const bodyRow = within(table.getByText('Manager One').closest('tr') as HTMLElement);
    expect(bodyRow.getByText('1500.50')).toBeInTheDocument();
    expect(bodyRow.getByText('250.25')).toBeInTheDocument();
    expect(bodyRow.getByText('+1250.25')).toBeInTheDocument();
    // The footer total mirrors the same coerced numbers.
    const totalRow = within(table.getByText('Total').closest('tr') as HTMLElement);
    expect(totalRow.getByText('1500.50')).toBeInTheDocument();
    expect(totalRow.getByText('+1250.25')).toBeInTheDocument();
  });

  it('falls back to @username when the manager has no full name', async () => {
    respondWith(
      [
        {
          manager_id: 'm1',
          manager_username: 'mgr_one',
          manager_full_name: null,
          deposits: 0,
          withdrawals: 0,
          profit: 0,
        },
      ],
      { deposits: 0, withdrawals: 0, profit: 0 }
    );

    renderTable();

    // TableSkeleton also renders a (headerless) <table> while loading, so wait
    // on a columnheader — only the real data table has <th>s.
    await waitFor(() => expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0));
    // @username fallback appears in both the card and the table; scope to table.
    expect(within(screen.getByRole('table')).getByText('@mgr_one')).toBeInTheDocument();
  });

  it('renders the empty state and no footer when there are no managers', async () => {
    respondWith([], { deposits: 0, withdrawals: 0, profit: 0 });

    renderTable();

    await waitFor(() => expect(screen.getByText('No managers found')).toBeInTheDocument());
    // Footer total row is only rendered when rows.length > 0.
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
  });

  it('renders an error message when the RPC fails', async () => {
    respondError('rpc exploded');

    renderTable();

    await waitFor(() => expect(screen.getByText(/rpc exploded/)).toBeInTheDocument());
  });

  it('keeps RTL-safe text-start on every column header', async () => {
    // Needs ≥1 row: the empty state renders a centered message instead of the
    // table, so an empty response would have no column headers to assert on.
    respondWith(
      [
        {
          manager_id: 'm1',
          manager_username: 'mgr_one',
          manager_full_name: 'Manager One',
          deposits: 0,
          withdrawals: 0,
          profit: 0,
        },
      ],
      { deposits: 0, withdrawals: 0, profit: 0 }
    );

    renderTable();

    // TableSkeleton also renders a (headerless) <table> while loading, so wait
    // on a columnheader — only the real data table has <th>s.
    await waitFor(() => expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0));
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBeGreaterThan(0);
    for (const th of headers) {
      expect(th).toHaveClass('text-start');
    }
  });
});
