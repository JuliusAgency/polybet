#!/usr/bin/env npx tsx
/**
 * Seeds test users to production via Supabase Admin API.
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-prod-users.ts
 *
 * Or load from .env.production:
 *   set -a && source .env.production && set +a
 *   SUPABASE_URL=$VITE_SUPABASE_URL npx tsx scripts/seed-prod-users.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Users ────────────────────────────────────────────────────────────────────

const USERS = [
  {
    email: 'admin@polybet.internal',
    password: 'Admin123!',
    username: 'admin',
    full_name: 'System Administrator',
    role: 'super_admin' as const,
  },
  {
    email: 'manager@polybet.internal',
    password: 'Manager123!',
    username: 'manager',
    full_name: 'Test Manager',
    role: 'manager' as const,
  },
  {
    email: 'user1@polybet.internal',
    password: 'User123!',
    username: 'user1',
    full_name: 'Test User 1',
    role: 'user' as const,
  },
  {
    email: 'user2@polybet.internal',
    password: 'User123!',
    username: 'user2',
    full_name: 'Test User 2',
    role: 'user' as const,
  },
  {
    email: 'user3@polybet.internal',
    password: 'User123!',
    username: 'user3',
    full_name: 'Test User 3',
    role: 'user' as const,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    console.error(`❌  ${message}`);
    process.exit(1);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀  Connecting to ${SUPABASE_URL}\n`);

  // 1. Create auth users and collect IDs
  const createdIds: Record<string, string> = {};

  for (const u of USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });

    if (error) {
      if ((error as { code?: string }).code === 'email_exists') {
        // Already exists — look up the ID via listUsers
        const { data: list, error: listError } = await supabase.auth.admin.listUsers();
        assert(!listError, `Failed to list users: ${listError?.message}`);
        const existing = list.users.find((user) => user.email === u.email);
        assert(!!existing, `User ${u.email} exists but was not found in the list`);
        createdIds[u.username] = existing.id;
        console.log(`⚠️   ${u.email} already exists, using id=${existing.id}`);
      } else {
        assert(false, `Failed to create ${u.email}: ${error.message}`);
      }
    } else {
      createdIds[u.username] = data.user.id;
      console.log(`✅  Created auth user: ${u.email} (${data.user.id})`);
    }
  }

  const adminId = createdIds['admin'];
  const managerId = createdIds['manager'];
  const userIds = ['user1', 'user2', 'user3'].map((u) => createdIds[u]);

  // 2. Profiles
  {
    const rows = USERS.map((u) => ({
      id: createdIds[u.username],
      username: u.username,
      full_name: u.full_name,
      role: u.role,
      is_active: true,
    }));
    const { error } = await supabase.from('profiles').upsert(rows, { onConflict: 'id' });
    assert(!error, `profiles upsert: ${error?.message}`);
    console.log('\n✅  profiles — done');
  }

  // 3. Managers (super_admin + manager)
  {
    const rows = [
      { id: adminId, balance: 0, margin: 0 },
      { id: managerId, balance: 0, margin: 5 },
    ];
    const { error } = await supabase.from('managers').upsert(rows, { onConflict: 'id' });
    assert(!error, `managers upsert: ${error?.message}`);
    console.log('✅  managers — done');
  }

  // 4. Balances for users
  {
    const rows = userIds.map((uid) => ({
      user_id: uid,
      available: 1000,
      in_play: 0,
    }));
    const { error } = await supabase.from('balances').upsert(rows, { onConflict: 'user_id' });
    assert(!error, `balances upsert: ${error?.message}`);
    console.log('✅  balances — done');
  }

  // 5. Manager–User links
  {
    const rows = userIds.map((uid) => ({ manager_id: managerId, user_id: uid }));
    const { error } = await supabase
      .from('manager_user_links')
      .upsert(rows, { onConflict: 'manager_id,user_id', ignoreDuplicates: true });
    assert(!error, `manager_user_links upsert: ${error?.message}`);
    console.log('✅  manager_user_links — done');
  }

  console.log('\n🎉  All users seeded successfully!');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
