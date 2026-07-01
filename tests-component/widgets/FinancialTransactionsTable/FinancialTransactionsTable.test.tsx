import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';

// The aggregation under test (running totals + deposit/withdrawal sums + net
// profit) lives in useFinancialTransactions, which the widget drives. We mock
// the shared Supabase client so the real fetch+compute path runs against
// in-memory rows. Mocking the client (instead of MSW) matches the repo
// convention (see BetSlip / AdjustBalanceModal tests) and avoids supabase-js
// rejecting the non-JWT test apikey before any request is made.
//
// Contract notes the arithmetic depends on:
// - `amount` is SIGNED in the DB: adjustment (deposit) is positive,
//   transfer (withdrawal) is negative.
// - Rows arrive newest-first (`.order('created_at', { ascending: false })`).
//   The hook reverses to oldest-first, computes the running cumulative sum into
//   `total_profit_calc`, then reverses back for display.

// Holds the resolved value the chainable query builder yields when awaited.
let queryResult: { data: unknown; error: unknown } = { data: [], error: null };

// Minimal thenable Supabase query builder: every filter/order method returns
// `this`, and awaiting the builder resolves to `queryResult` (what the hook does
// with `await query`).
const makeBuilder = () => {
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    gte: () => builder,
    lt: () => builder,
    then: (resolve: (value: typeof queryResult) => unknown) => resolve(queryResult),
  };
  return builder;
};

vi.mock('@/shared/api/supabase', () => ({
  supabase: {
    from: () => makeBuilder(),
  },
}));

import { FinancialTransactionsTable } from '@/widgets/FinancialTransactionsTable';
import type { FinancialTransactionRow } from '@/features/admin/financial-transactions';
import { renderWithProviders } from '../../helpers/render';

// The DB view returns every column except the client-computed `total_profit_calc`.
type RawRow = Omit<FinancialTransactionRow, 'total_profit_calc'>;

const baseRow = (overrides: Partial<RawRow> & Pick<RawRow, 'id'>): RawRow => ({
  created_at: '2026-06-01T10:00:00.000Z',
  type: 'adjustment',
  amount: 0,
  balance_after: 0,
  note: null,
  user_id: 'user-1',
  user_username: 'alice',
  user_full_name: 'Alice A',
  initiated_by: 'mgr-1',
  manager_username: 'mgr',
  manager_full_name: 'Manager One',
  initiator_role: 'manager',
  ...overrides,
});

// Rows are newest-first (most recent created_at at index 0), matching the DB order.
const respondWith = (rows: RawRow[]) => {
  queryResult = { data: rows, error: null };
};

const respondError = (message: string) => {
  queryResult = { data: null, error: { message } };
};

const freshClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

const renderTable = () =>
  renderWithProviders(<FinancialTransactionsTable />, { queryClient: freshClient() });

// The totals summary renders each metric as `<span>{label}:{' '}<span>{value}</span></span>`.
// The label and `:` are separate text nodes, so getByText(label) cannot match.
// Locate the outer wrapper span whose own text starts with the label, then
// assert on its full text content (label + value).
const totalsSpan = (label: string): HTMLElement => {
  const spans = Array.from(document.querySelectorAll('span'));
  const match = spans.find((s) => {
    // Direct text of this span (excluding nested element text) starts with label.
    const ownText = Array.from(s.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
    return ownText.startsWith(label);
  });
  if (!match) throw new Error(`totals span for "${label}" not found`);
  return match;
};

beforeEach(() => {
  queryResult = { data: [], error: null };
});

describe('FinancialTransactionsTable', () => {
  it('computes the running cumulative total per row (oldest→newest) and shows it newest-first', async () => {
    // Newest-first input. Oldest→newest the signed amounts are +100, -30, +50,
    // so the running totals oldest→newest are 100, 70, 120. Displayed
    // newest-first that is row order: +50 (120), -30 (70), +100 (100).
    respondWith([
      baseRow({
        id: 'tx-newest',
        type: 'adjustment',
        amount: 50,
        created_at: '2026-06-03T10:00:00.000Z',
      }),
      baseRow({
        id: 'tx-middle',
        type: 'transfer',
        amount: -30,
        created_at: '2026-06-02T10:00:00.000Z',
      }),
      baseRow({
        id: 'tx-oldest',
        type: 'adjustment',
        amount: 100,
        created_at: '2026-06-01T10:00:00.000Z',
      }),
    ]);

    renderTable();

    // Wait for the data to land (skeleton -> table). The widget renders a mobile
    // card list AND the desktop table (jsdom shows both), so every value appears
    // twice; assert on the <table> to disambiguate. getAllByRole('row') only
    // returns table <tr>s (cards are <div>s), so row scoping stays valid.
    // TableSkeleton also renders a (headerless) <table> while loading, so wait
    // on a columnheader — only the real data table has <th>s.
    await waitFor(() => expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0));

    const rows = screen.getAllByRole('row');
    // header row + 3 body rows
    expect(rows).toHaveLength(4);

    // Newest row first: amount +50.00, running total +120.00
    const newest = within(rows[1]);
    expect(newest.getByText('+50.00')).toBeInTheDocument();
    expect(newest.getByText('+120.00')).toBeInTheDocument();

    // Middle row: withdrawal -30.00, running total +70.00
    const middle = within(rows[2]);
    expect(middle.getByText('-30.00')).toBeInTheDocument();
    expect(middle.getByText('+70.00')).toBeInTheDocument();

    // Oldest row: deposit +100.00, running total +100.00.
    // +100.00 appears as both the amount and the running total in this row.
    const oldest = within(rows[3]);
    expect(oldest.getAllByText('+100.00')).toHaveLength(2);
  });

  it('renders a negative running total without a leading plus sign', async () => {
    // Oldest→newest: +20, -80 => running totals 20, -60.
    // Displayed newest-first: -80 (running -60), +20 (running +20).
    respondWith([
      baseRow({
        id: 'tx-b',
        type: 'transfer',
        amount: -80,
        created_at: '2026-06-02T10:00:00.000Z',
      }),
      baseRow({
        id: 'tx-a',
        type: 'adjustment',
        amount: 20,
        created_at: '2026-06-01T10:00:00.000Z',
      }),
    ]);

    renderTable();

    // Wait for the table (card + table both render every value, so a bare
    // getByText('tx-b') would match twice).
    // TableSkeleton also renders a (headerless) <table> while loading, so wait
    // on a columnheader — only the real data table has <th>s.
    await waitFor(() => expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0));

    // Scope to the body row: the amount also surfaces in the totals summary, so
    // a document-wide getByText('-80.00') would match more than one node.
    const rows = screen.getAllByRole('row');
    const newest = within(rows[1]);
    expect(newest.getByText('-80.00')).toBeInTheDocument();
    // formatRunningTotal: negative values keep their own '-' and get no '+'.
    expect(newest.getByText('-60.00')).toBeInTheDocument();
    // No "+-60.00" double-sign artifact anywhere.
    expect(screen.queryByText('+-60.00')).not.toBeInTheDocument();
  });

  it('sums deposits, withdrawals and net profit in the totals summary', async () => {
    // Deposits (adjustment, positive): 100 + 50 + 25 = 175.00
    // Withdrawals (transfer, abs): |−30| + |−45| = 75.00
    // Net profit: 175 - 75 = 100.00
    respondWith([
      baseRow({
        id: 'd1',
        type: 'adjustment',
        amount: 100,
        created_at: '2026-06-05T10:00:00.000Z',
      }),
      baseRow({ id: 'w1', type: 'transfer', amount: -45, created_at: '2026-06-04T10:00:00.000Z' }),
      baseRow({ id: 'd2', type: 'adjustment', amount: 50, created_at: '2026-06-03T10:00:00.000Z' }),
      baseRow({ id: 'w2', type: 'transfer', amount: -30, created_at: '2026-06-02T10:00:00.000Z' }),
      baseRow({ id: 'd3', type: 'adjustment', amount: 25, created_at: '2026-06-01T10:00:00.000Z' }),
    ]);

    renderTable();

    // Total Deposits +175.00
    await waitFor(() => expect(totalsSpan('Total Deposits')).toHaveTextContent('+175.00'));
    expect(totalsSpan('Total Withdrawals')).toHaveTextContent('-75.00');
    // Net profit is positive here -> shown with a leading plus.
    expect(totalsSpan('Net Profit')).toHaveTextContent('+100.00');
  });

  it('renders a negative net profit (withdrawals exceed deposits) without a forced plus', async () => {
    // Deposits: 40. Withdrawals: |−100| = 100. Net: 40 - 100 = -60.00
    respondWith([
      baseRow({ id: 'w', type: 'transfer', amount: -100, created_at: '2026-06-02T10:00:00.000Z' }),
      baseRow({ id: 'd', type: 'adjustment', amount: 40, created_at: '2026-06-01T10:00:00.000Z' }),
    ]);

    renderTable();

    await waitFor(() => expect(totalsSpan('Net Profit')).toHaveTextContent('-60.00'));
    // Negative net profit must NOT be prefixed with '+'.
    expect(totalsSpan('Net Profit')).not.toHaveTextContent('+-60.00');
  });

  it('formats deposit vs withdrawal amount signs from the signed DB amount', async () => {
    // A leading +5 row keeps each later row's amount distinct from its running
    // total, so an amount can be asserted unambiguously within its row.
    // Oldest→newest: +5 (run +5), -7.5 (run -2.5), +12.5 (run +10).
    respondWith([
      baseRow({
        id: 'dep',
        type: 'adjustment',
        amount: 12.5,
        created_at: '2026-06-03T10:00:00.000Z',
      }),
      baseRow({ id: 'wd', type: 'transfer', amount: -7.5, created_at: '2026-06-02T10:00:00.000Z' }),
      baseRow({
        id: 'seed',
        type: 'adjustment',
        amount: 5,
        created_at: '2026-06-01T10:00:00.000Z',
      }),
    ]);

    renderTable();

    // TableSkeleton also renders a (headerless) <table> while loading, so wait
    // on a columnheader — only the real data table has <th>s.
    await waitFor(() => expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0));

    // Newest-first: dep at rows[1], wd at rows[2]. Scope amounts to the body
    // rows since figures also appear in the totals summary.
    const rows = screen.getAllByRole('row');
    const depRow = within(rows[1]);
    const wdRow = within(rows[2]);
    // Deposit amount: leading '+' and the literal value (running total is +10.00).
    expect(depRow.getByText('+12.50')).toBeInTheDocument();
    // Withdrawal amount: leading '-' and absolute value (running total is -2.50).
    expect(wdRow.getByText('-7.50')).toBeInTheDocument();
    // Type badges: Deposit for adjustment, Withdrawal for transfer.
    expect(depRow.getByText('Deposit')).toBeInTheDocument();
    expect(wdRow.getByText('Withdrawal')).toBeInTheDocument();
  });

  it('shows the super-admin alias instead of the username for super_admin initiators', async () => {
    respondWith([
      baseRow({
        id: 'sa',
        type: 'adjustment',
        amount: 10,
        initiator_role: 'super_admin',
        manager_username: 'root',
        created_at: '2026-06-01T10:00:00.000Z',
      }),
    ]);

    renderTable();

    await waitFor(() => expect(screen.getByText('Super Admin')).toBeInTheDocument());
    // The raw username must not leak when the initiator is a super admin.
    expect(screen.queryByText('@root')).not.toBeInTheDocument();
  });

  it('renders the empty state and zeroed totals when there are no transactions', async () => {
    respondWith([]);

    renderTable();

    await waitFor(() => expect(screen.getByText('No transactions found')).toBeInTheDocument());
    // Empty sums.
    expect(totalsSpan('Total Deposits')).toHaveTextContent('+0.00');
    expect(totalsSpan('Total Withdrawals')).toHaveTextContent('-0.00');
    expect(totalsSpan('Net Profit')).toHaveTextContent('+0.00');
  });

  it('renders an error message when the query fails', async () => {
    respondError('boom from postgrest');

    renderTable();

    await waitFor(() => expect(screen.getByText(/boom from postgrest/)).toBeInTheDocument());
  });

  it('keeps RTL-safe text-start on every column header', async () => {
    // Needs ≥1 row: the empty state renders a centered message instead of the
    // table, so an empty response would have no column headers to assert on.
    respondWith([baseRow({ id: 'h1', type: 'adjustment', amount: 10 })]);

    renderTable();

    // TableSkeleton also renders a (headerless) <table> while loading, so wait
    // on a columnheader — only the real data table has <th>s.
    await waitFor(() => expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0));
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBeGreaterThan(0);
    // text-start must live directly on each <th>, not only on the parent <tr>,
    // or the UA `th { text-align: center }` wins in RTL.
    for (const th of headers) {
      expect(th).toHaveClass('text-start');
    }
  });
});
