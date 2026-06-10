import { describe, expect, it } from 'vitest';
import { withTransaction } from '../helpers/pg';
import { seedEventWithMarket, seedOutcome } from '../factories';

// Coverage for migration 20260610115136_managers_report_profit_formula
// (supersedes 20260609132406): admin_build_managers_report_dataset(start, end)
// returns per-manager Deposits / Withdrawals / Profit for a period.
//
//   Deposits    = manager-initiated balance_transactions type='adjustment' (+)
//   Withdrawals = manager-initiated type='transfer' magnitude (stored -, reported +)
//   Profit      = Deposits - Withdrawals (spec: Net Profit Calculator).
//                 Positions/settlements do NOT participate (QA fix 2026-06-10).
//
// Uses the seeded manager (0002) -> user1 (0003) link and asserts on DELTAS so it
// is independent of any baseline rows in the window. Everything rolls back.

const MANAGER_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = '00000000-0000-0000-0000-000000000003'; // user1, linked to manager 0002

interface ManagerRow {
  manager_id: string;
  deposits: number;
  withdrawals: number;
  profit: number;
}

const START = new Date(Date.now() - 86_400_000).toISOString(); // now - 1d
const END = new Date(Date.now() + 86_400_000).toISOString(); // now + 1d

async function managerRow(
  c: Parameters<Parameters<typeof withTransaction>[0]>[0]
): Promise<ManagerRow> {
  const res = await c.query<{ dataset: { rows: ManagerRow[] } }>(
    'SELECT admin_build_managers_report_dataset($1, $2) AS dataset',
    [START, END]
  );
  const row = res.rows[0].dataset.rows.find((r) => r.manager_id === MANAGER_ID);
  if (!row) throw new Error('seeded manager 0002 missing from dataset');
  return {
    manager_id: row.manager_id,
    deposits: Number(row.deposits),
    withdrawals: Number(row.withdrawals),
    profit: Number(row.profit),
  };
}

describe('admin_build_managers_report_dataset (migration 20260610115136)', () => {
  it('aggregates deposits, withdrawals and profit = deposits - withdrawals within the period', async () => {
    await withTransaction(async (c) => {
      const before = await managerRow(c);

      // Deposit (+1000) and withdrawal (-400) initiated BY the manager on their user.
      await c.query(
        `INSERT INTO balance_transactions (user_id, initiated_by, type, amount, balance_after, note)
         VALUES ($1, $2, 'adjustment',  1000, 0, 'test deposit'),
                ($1, $2, 'transfer',    -400, 0, 'test withdrawal')`,
        [USER_ID, MANAGER_ID]
      );

      // One won + one lost position settled inside the window, for the linked
      // user. Distinct outcomes — positions are UNIQUE per (user_id, outcome_id).
      // Deliberately kept seeded: regression guard proving settlements no longer
      // leak into profit (the old house-P/L formula would have added -20).
      const { market } = await seedEventWithMarket(c);
      const wonOutcome = await seedOutcome(c, { market_id: market.id, name: 'Yes' });
      const lostOutcome = await seedOutcome(c, { market_id: market.id, name: 'No' });
      await c.query(
        `INSERT INTO positions (user_id, market_id, outcome_id, shares, avg_price, cost_basis, status, settled_at)
         VALUES ($1, $2, $3, 100, 0.6, 0, 'won',  now()),
                ($1, $2, $4,  50, 0.4, 0, 'lost', now())`,
        [USER_ID, market.id, wonOutcome.id, lostOutcome.id]
      );

      const after = await managerRow(c);

      // Deposits +1000, Withdrawals +400 (reported as positive magnitude).
      expect(after.deposits - before.deposits).toBeCloseTo(1000, 6);
      expect(after.withdrawals - before.withdrawals).toBeCloseTo(400, 6);

      // Profit = deposits - withdrawals: 1000 - 400 = 600. The settled positions
      // above must NOT shift this (old formula would have produced 600 - 20).
      expect(after.profit - before.profit).toBeCloseTo(600, 6);
    });
  });

  it('excludes activity outside the selected period', async () => {
    await withTransaction(async (c) => {
      const before = await managerRow(c);

      // A deposit two days ago — outside [now-1d, now+1d].
      await c.query(
        `INSERT INTO balance_transactions (user_id, initiated_by, type, amount, balance_after, note, created_at)
         VALUES ($1, $2, 'adjustment', 5000, 0, 'old deposit', now() - interval '2 days')`,
        [USER_ID, MANAGER_ID]
      );

      const after = await managerRow(c);
      expect(after.deposits - before.deposits).toBeCloseTo(0, 6);
      expect(after.profit - before.profit).toBeCloseTo(0, 6);
    });
  });
});
