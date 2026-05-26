import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { withTransaction } from '../helpers/pg';

// Coverage for the privileged user-profile edit + manager password reset RPCs
// added in migration 20260524100943_user_edit_and_manager_reset:
//   - admin_update_user            (super_admin only)
//   - manager_update_linked_user   (manager, linked user only)
//   - manager_reset_password       (manager, linked user only)
//
// Seeded fixtures (supabase/seed/002_test_users.sql):
//   admin   = …0001 (super_admin)
//   manager = …0002 (manager), linked to user1/user2/user3
//   user1   = …0003 (user, linked to manager)

const ADMIN = '00000000-0000-0000-0000-000000000001';
const MANAGER = '00000000-0000-0000-0000-000000000002';
const USER1 = '00000000-0000-0000-0000-000000000003';

async function authAs(c: PoolClient, userId: string): Promise<void> {
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  await c.query(`SELECT set_config('role', 'authenticated', true)`);
}

// Return to the superuser connection role for seeding / verification reads
// (superuser bypasses RLS). Transaction-local, restored on rollback anyway.
async function asSuperuser(c: PoolClient): Promise<void> {
  await c.query(`SELECT set_config('role', 'postgres', true)`);
}

// Insert a fresh user that is NOT linked to the manager.
async function seedUnlinkedUser(c: PoolClient): Promise<string> {
  const res = await c.query<{ id: string }>(
    `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at)
     VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'unlinked-' || gen_random_uuid() || '@polybet.internal',
        extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now())
     RETURNING id`
  );
  const id = res.rows[0].id;
  await c.query(
    `INSERT INTO profiles (id, username, full_name, first_name, last_name, role, is_active)
     VALUES ($1::uuid, 'unlinked-' || $1::text, 'Unlinked User', 'Unlinked', 'User', 'user', true)`,
    [id]
  );
  return id;
}

describe('admin_update_user (super_admin)', () => {
  it('updates first/last/phone and recomputes full_name + logs', async () => {
    await withTransaction(async (c) => {
      await authAs(c, ADMIN);
      await c.query(`SELECT admin_update_user($1::uuid, $2, $3, $4)`, [
        USER1,
        'Alice',
        'Cooper',
        '+15551234',
      ]);
      await asSuperuser(c);
      const { rows } = await c.query(
        `SELECT first_name, last_name, full_name, phone FROM profiles WHERE id = $1`,
        [USER1]
      );
      expect(rows[0]).toMatchObject({
        first_name: 'Alice',
        last_name: 'Cooper',
        full_name: 'Alice Cooper',
        phone: '+15551234',
      });
      const log = await c.query(
        `SELECT 1 FROM admin_action_logs
         WHERE action = 'update_profile' AND target_id = $1 AND initiated_by = $2`,
        [USER1, ADMIN]
      );
      expect(log.rowCount).toBe(1);
    });
  });

  it('rejects a non-super_admin caller', async () => {
    await withTransaction(async (c) => {
      await authAs(c, MANAGER);
      await expect(
        c.query(`SELECT admin_update_user($1::uuid, $2, $3, $4)`, [USER1, 'X', 'Y', null])
      ).rejects.toThrow(/super_admin required/i);
    });
  });

  it('rejects an empty first name', async () => {
    await withTransaction(async (c) => {
      await authAs(c, ADMIN);
      await expect(
        c.query(`SELECT admin_update_user($1::uuid, $2, $3, $4)`, [USER1, '   ', 'Y', null])
      ).rejects.toThrow(/first name is required/i);
    });
  });
});

describe('manager_update_linked_user (manager)', () => {
  it('updates a linked user', async () => {
    await withTransaction(async (c) => {
      await authAs(c, MANAGER);
      await c.query(`SELECT manager_update_linked_user($1::uuid, $2, $3, $4)`, [
        USER1,
        'Bob',
        'Dylan',
        null,
      ]);
      await asSuperuser(c);
      const { rows } = await c.query(`SELECT full_name, phone FROM profiles WHERE id = $1`, [
        USER1,
      ]);
      expect(rows[0]).toMatchObject({ full_name: 'Bob Dylan', phone: null });
    });
  });

  it('rejects a user not linked to the manager', async () => {
    await withTransaction(async (c) => {
      const unlinked = await seedUnlinkedUser(c);
      await authAs(c, MANAGER);
      await expect(
        c.query(`SELECT manager_update_linked_user($1::uuid, $2, $3, $4)`, [
          unlinked,
          'X',
          'Y',
          null,
        ])
      ).rejects.toThrow(/not linked to this manager/i);
    });
  });

  it('rejects targeting a non-user (e.g. the super_admin)', async () => {
    await withTransaction(async (c) => {
      await authAs(c, MANAGER);
      await expect(
        c.query(`SELECT manager_update_linked_user($1::uuid, $2, $3, $4)`, [ADMIN, 'X', 'Y', null])
      ).rejects.toThrow(/only linked users/i);
    });
  });

  it('rejects a non-manager caller', async () => {
    await withTransaction(async (c) => {
      await authAs(c, ADMIN);
      await expect(
        c.query(`SELECT manager_update_linked_user($1::uuid, $2, $3, $4)`, [USER1, 'X', 'Y', null])
      ).rejects.toThrow(/manager required/i);
    });
  });
});

describe('manager_reset_password (manager)', () => {
  it('resets a linked user password and logs', async () => {
    await withTransaction(async (c) => {
      const before = await c.query<{ encrypted_password: string }>(
        `SELECT encrypted_password FROM auth.users WHERE id = $1`,
        [USER1]
      );
      await authAs(c, MANAGER);
      await c.query(`SELECT manager_reset_password($1::uuid, $2)`, [USER1, 'brandnew123']);
      await asSuperuser(c);
      const after = await c.query<{ encrypted_password: string }>(
        `SELECT encrypted_password FROM auth.users WHERE id = $1`,
        [USER1]
      );
      expect(after.rows[0].encrypted_password).not.toBe(before.rows[0].encrypted_password);
      const log = await c.query(
        `SELECT 1 FROM admin_action_logs
         WHERE action = 'reset_password' AND target_id = $1 AND initiated_by = $2`,
        [USER1, MANAGER]
      );
      expect(log.rowCount).toBe(1);
    });
  });

  it('rejects an unlinked user', async () => {
    await withTransaction(async (c) => {
      const unlinked = await seedUnlinkedUser(c);
      await authAs(c, MANAGER);
      await expect(
        c.query(`SELECT manager_reset_password($1::uuid, $2)`, [unlinked, 'brandnew123'])
      ).rejects.toThrow(/not linked to this manager/i);
    });
  });

  it('rejects a too-short password', async () => {
    await withTransaction(async (c) => {
      await authAs(c, MANAGER);
      await expect(
        c.query(`SELECT manager_reset_password($1::uuid, $2)`, [USER1, '123'])
      ).rejects.toThrow(/at least 6 characters/i);
    });
  });
});
