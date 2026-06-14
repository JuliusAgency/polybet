import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { withTransaction } from '../helpers/pg';

// Coverage for migration 20260611170133 (withdraw full-balance clamp): the
// three balance-adjustment RPCs treat a withdrawal request exceeding the true
// balance by at most 0.01 as "withdraw everything". Trading accumulates
// fractional cents (e.g. 1199.9999987), the UI shows round(x, 2) = 1200.00,
// and before the clamp the strict comparison rejected the displayed amount.

const ADMIN = '00000000-0000-0000-0000-000000000001';
const MANAGER = '00000000-0000-0000-0000-000000000002';
const USER1 = '00000000-0000-0000-0000-000000000003';

const FRACTIONAL = '1199.9999987';

async function authAs(c: PoolClient, userId: string): Promise<void> {
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  await c.query(`SELECT set_config('role', 'authenticated', true)`);
}

/** Set USER1's available balance to an exact numeric (as service/postgres). */
async function setUserAvailable(c: PoolClient, amount: string): Promise<void> {
  await c.query(`UPDATE balances SET available = $1::numeric WHERE user_id = $2`, [amount, USER1]);
}

/** Set MANAGER's managers.balance to an exact numeric (as service/postgres). */
async function setManagerBalance(c: PoolClient, amount: string): Promise<void> {
  await c.query(`UPDATE managers SET balance = $1::numeric WHERE id = $2`, [amount, MANAGER]);
}

async function userAvailable(c: PoolClient): Promise<string> {
  const r = await c.query<{ available: string }>(
    'SELECT available::text AS available FROM balances WHERE user_id = $1',
    [USER1]
  );
  return r.rows[0].available;
}

async function managerBalance(c: PoolClient): Promise<string> {
  const r = await c.query<{ balance: string }>(
    'SELECT balance::text AS balance FROM managers WHERE id = $1',
    [MANAGER]
  );
  return r.rows[0].balance;
}

/** Most recent ledger row for the given account (user or manager). */
async function lastTx(
  c: PoolClient,
  accountId: string
): Promise<{ type: string; amount: string; balance_after: string }> {
  const r = await c.query<{ type: string; amount: string; balance_after: string }>(
    `SELECT type, amount::text AS amount, balance_after::text AS balance_after
     FROM balance_transactions WHERE user_id = $1
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [accountId]
  );
  return r.rows[0];
}

describe('manager_adjust_balance withdrawal clamp', () => {
  it('withdraws the displayed (rounded-up) amount and lands on exactly 0', async () => {
    await withTransaction(async (c) => {
      await setUserAvailable(c, FRACTIONAL);
      await authAs(c, MANAGER);
      await c.query(`SELECT manager_adjust_balance($1::uuid, 1200.00, 'withdrawal', NULL)`, [
        USER1,
      ]);

      expect(Number(await userAvailable(c))).toBe(0);

      const tx = await lastTx(c, USER1);
      expect(tx.type).toBe('transfer');
      // The ledger records the ACTUAL deducted amount, not the requested one.
      expect(tx.amount).toBe(`-${FRACTIONAL}`);
      expect(Number(tx.balance_after)).toBe(0);
    });
  });

  it('rejects a request more than 0.01 above the balance', async () => {
    await withTransaction(async (c) => {
      await setUserAvailable(c, FRACTIONAL);
      await authAs(c, MANAGER);
      const attempt = c.query(
        `SELECT manager_adjust_balance($1::uuid, 1200.02, 'withdrawal', NULL)`,
        [USER1]
      );
      await expect(attempt).rejects.toThrow(/Insufficient balance/i);
    });
  });

  it('keeps normal partial withdrawals exact (no clamp below the balance)', async () => {
    await withTransaction(async (c) => {
      await setUserAvailable(c, FRACTIONAL);
      await authAs(c, MANAGER);
      await c.query(`SELECT manager_adjust_balance($1::uuid, 500, 'withdrawal', NULL)`, [USER1]);

      // 1199.9999987 - 500, exact in the numeric domain.
      expect(await userAvailable(c)).toBe('699.9999987');
      const tx = await lastTx(c, USER1);
      expect(Number(tx.amount)).toBe(-500);
    });
  });

  it('rejects withdrawing from an empty balance even within the tolerance', async () => {
    await withTransaction(async (c) => {
      await setUserAvailable(c, '0');
      await authAs(c, MANAGER);
      const attempt = c.query(`SELECT manager_adjust_balance($1::uuid, 0.01, 'withdrawal', NULL)`, [
        USER1,
      ]);
      await expect(attempt).rejects.toThrow(/Insufficient balance/i);
    });
  });

  it('deposit is unaffected by the clamp', async () => {
    await withTransaction(async (c) => {
      await setUserAvailable(c, FRACTIONAL);
      await authAs(c, MANAGER);
      await c.query(`SELECT manager_adjust_balance($1::uuid, 10, 'deposit', NULL)`, [USER1]);
      expect(await userAvailable(c)).toBe('1209.9999987');
    });
  });
});

describe('admin_adjust_balance withdrawal clamp', () => {
  it('withdraws the displayed (rounded-up) amount and lands on exactly 0', async () => {
    await withTransaction(async (c) => {
      await setUserAvailable(c, FRACTIONAL);
      await authAs(c, ADMIN);
      await c.query(`SELECT admin_adjust_balance($1::uuid, 1200.00, 'withdrawal', NULL)`, [USER1]);

      expect(Number(await userAvailable(c))).toBe(0);
      const tx = await lastTx(c, USER1);
      expect(tx.type).toBe('transfer');
      expect(tx.amount).toBe(`-${FRACTIONAL}`);
      expect(Number(tx.balance_after)).toBe(0);
    });
  });

  it('rejects a request more than 0.01 above the balance', async () => {
    await withTransaction(async (c) => {
      await setUserAvailable(c, FRACTIONAL);
      await authAs(c, ADMIN);
      const attempt = c.query(
        `SELECT admin_adjust_balance($1::uuid, 1200.02, 'withdrawal', NULL)`,
        [USER1]
      );
      await expect(attempt).rejects.toThrow(/Insufficient balance/i);
    });
  });
});

describe('admin_adjust_manager_balance withdrawal clamp', () => {
  it('withdraws the displayed (rounded-up) amount and lands on exactly 0', async () => {
    await withTransaction(async (c) => {
      await setManagerBalance(c, FRACTIONAL);
      await authAs(c, ADMIN);
      await c.query(`SELECT admin_adjust_manager_balance($1::uuid, 1200.00, 'withdrawal', NULL)`, [
        MANAGER,
      ]);

      expect(Number(await managerBalance(c))).toBe(0);
      const tx = await lastTx(c, MANAGER);
      expect(tx.type).toBe('transfer');
      expect(tx.amount).toBe(`-${FRACTIONAL}`);
      expect(Number(tx.balance_after)).toBe(0);
    });
  });

  it('rejects a request more than 0.01 above the balance', async () => {
    await withTransaction(async (c) => {
      await setManagerBalance(c, FRACTIONAL);
      await authAs(c, ADMIN);
      const attempt = c.query(
        `SELECT admin_adjust_manager_balance($1::uuid, 1200.02, 'withdrawal', NULL)`,
        [MANAGER]
      );
      await expect(attempt).rejects.toThrow(/Insufficient balance/i);
    });
  });
});
