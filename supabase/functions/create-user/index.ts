// Edge Function: create-user
// Creates a new manager (by super_admin) or end user (by manager).
// POST { role, fullName, username, password, phone?, notes?, margin? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateUserRequest {
  role: 'manager' | 'user';
  fullName: string;
  username: string;
  password: string;
  phone?: string;
  notes?: string;
  margin?: number;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST.' }, 405);
  }

  // ── 1. Parse request body ─────────────────────────────────────────────────
  let body: CreateUserRequest;
  try {
    body = (await req.json()) as CreateUserRequest;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // ── 2. Validate required fields ───────────────────────────────────────────
  const missingFields: string[] = [];
  if (!body.role)     missingFields.push('role');
  if (!body.fullName) missingFields.push('fullName');
  if (!body.username) missingFields.push('username');
  if (!body.password) missingFields.push('password');

  if (missingFields.length > 0) {
    return json({ error: 'missing_fields', fields: missingFields }, 400);
  }

  if (body.role !== 'manager' && body.role !== 'user') {
    return json({ error: 'invalid_role' }, 400);
  }

  const { role, fullName, username, password, phone, notes, margin } = body;

  // ── 3. Extract caller JWT ─────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── 4. Build Supabase clients ─────────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'internal_error', details: 'env_misconfigured' }, 500);
  }

  // Service client for admin operations (bypasses RLS)
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Caller client to verify identity and role
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // ── 5. Resolve caller identity ────────────────────────────────────────────
  const { data: { user: callerUser }, error: callerAuthErr } = await callerClient.auth.getUser();

  if (callerAuthErr || !callerUser) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const callerId = callerUser.id;

  // ── 6. Look up caller's role from profiles ────────────────────────────────
  const { data: callerProfile, error: profileErr } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();

  if (profileErr) {
    return json({ error: 'internal_error', details: profileErr.message }, 500);
  }

  if (!callerProfile) {
    return json({ error: 'Forbidden' }, 403);
  }

  type UserRole = 'super_admin' | 'manager' | 'user';
  const callerRole = callerProfile.role as UserRole;

  // ── 7. Authorization check ────────────────────────────────────────────────
  if (callerRole === 'super_admin') {
    // super_admin can create both manager and user
  } else if (callerRole === 'manager') {
    // manager can only create user
    if (role !== 'user') {
      return json({ error: 'Forbidden' }, 403);
    }
  } else {
    return json({ error: 'Forbidden' }, 403);
  }

  // ── 8. Check username uniqueness ──────────────────────────────────────────
  const { data: existingProfile, error: usernameCheckErr } = await adminClient
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (usernameCheckErr) {
    return json({ error: 'internal_error', details: usernameCheckErr.message }, 500);
  }

  if (existingProfile) {
    return json({ error: 'username_taken' }, 409);
  }

  // ── 9. Create auth user ───────────────────────────────────────────────────
  const { data: newAuthUser, error: createAuthErr } = await adminClient.auth.admin.createUser({
    email:         `${username}@polybet.internal`,
    password,
    email_confirm: true,
  });

  if (createAuthErr || !newAuthUser?.user) {
    return json(
      { error: 'internal_error', details: createAuthErr?.message ?? 'Failed to create auth user' },
      500,
    );
  }

  const newUserId = newAuthUser.user.id;

  // ── 10. Insert into profiles ──────────────────────────────────────────────
  const { error: profileInsertErr } = await adminClient.from('profiles').insert({
    id:         newUserId,
    username,
    full_name:  fullName,
    role,
    phone:      phone ?? null,
    notes:      notes ?? null,
    is_active:  true,
    created_by: callerId,
  });

  if (profileInsertErr) {
    // Attempt cleanup: remove the auth user we just created
    await adminClient.auth.admin.deleteUser(newUserId);
    return json({ error: 'internal_error', details: profileInsertErr.message }, 500);
  }

  // ── 11. Role-specific inserts ─────────────────────────────────────────────
  if (role === 'manager') {
    const { error: managerInsertErr } = await adminClient.from('managers').insert({
      id:            newUserId,
      balance:       0,
      margin:        margin ?? 0,
      max_bet_limit: 0,
      max_win_limit: 0,
    });

    if (managerInsertErr) {
      // Attempt cleanup
      await adminClient.from('profiles').delete().eq('id', newUserId);
      await adminClient.auth.admin.deleteUser(newUserId);
      return json({ error: 'internal_error', details: managerInsertErr.message }, 500);
    }
  } else {
    // role === 'user'
    if (callerRole === 'manager') {
      const { error: linkInsertErr } = await adminClient.from('manager_user_links').insert({
        manager_id: callerId,
        user_id:    newUserId,
      });

      if (linkInsertErr) {
        // Attempt cleanup
        await adminClient.from('profiles').delete().eq('id', newUserId);
        await adminClient.auth.admin.deleteUser(newUserId);
        return json({ error: 'internal_error', details: linkInsertErr.message }, 500);
      }
    }
    // If super_admin creates a user, skip manager_user_links (not applicable in this sprint)

    const { error: balanceInsertErr } = await adminClient.from('balances').insert({
      user_id:  newUserId,
      available: 0,
      in_play:  0,
    });

    if (balanceInsertErr) {
      // Attempt cleanup
      if (callerRole === 'manager') {
        await adminClient.from('manager_user_links').delete().eq('user_id', newUserId);
      }
      await adminClient.from('profiles').delete().eq('id', newUserId);
      await adminClient.auth.admin.deleteUser(newUserId);
      return json({ error: 'internal_error', details: balanceInsertErr.message }, 500);
    }
  }

  // ── 12. Return success ────────────────────────────────────────────────────
  return json({
    success:           true,
    id:                newUserId,
    username,
    generatedPassword: password,
  });
});
