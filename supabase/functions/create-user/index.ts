// Edge Function: create-user
// Creates a new manager (by super_admin) or end user (by manager).
// POST { role, fullName, username, password, phone?, notes?, margin? }

import { authorizeEdgeCall } from '../_shared/edgeAuth.ts';
import { buildCorsPreflightResponse, jsonWithCors } from '../_shared/cors.ts';

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

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return buildCorsPreflightResponse('POST, OPTIONS');
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return jsonWithCors({ error: 'Method not allowed. Use POST.' }, 405);
  }

  // ── 1. Parse request body ─────────────────────────────────────────────────
  let body: CreateUserRequest;
  try {
    body = (await req.json()) as CreateUserRequest;
  } catch {
    return jsonWithCors({ error: 'Invalid JSON body' }, 400);
  }

  // ── 2. Validate required fields ───────────────────────────────────────────
  const missingFields: string[] = [];
  if (!body.role)     missingFields.push('role');
  if (!body.fullName) missingFields.push('fullName');
  if (!body.username) missingFields.push('username');
  if (!body.password) missingFields.push('password');

  if (missingFields.length > 0) {
    return jsonWithCors({ error: 'missing_fields', fields: missingFields }, 400);
  }

  if (body.role !== 'manager' && body.role !== 'user') {
    return jsonWithCors({ error: 'invalid_role' }, 400);
  }

  const { role, fullName, username, password, phone, notes, margin } = body;

  // ── 3. Authorize caller ───────────────────────────────────────────────────
  const authResult = await authorizeEdgeCall(req, {
    allowedRoles: ['super_admin', 'manager'],
  });

  if (!authResult.ok) {
    return jsonWithCors(authResult.body, authResult.status);
  }

  const adminClient = authResult.adminClient;
  const callerId = authResult.callerId!;
  const callerRole = authResult.callerRole!;

  // ── 7. Authorization check ────────────────────────────────────────────────
  if (callerRole === 'super_admin') {
    // super_admin can create both manager and user
  } else if (callerRole === 'manager') {
    // manager can only create user
    if (role !== 'user') {
      return jsonWithCors({ error: 'Forbidden' }, 403);
    }
  } else {
    return jsonWithCors({ error: 'Forbidden' }, 403);
  }

  // ── 8. Check username uniqueness ──────────────────────────────────────────
  const { data: existingProfile, error: usernameCheckErr } = await adminClient
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (usernameCheckErr) {
    return jsonWithCors({ error: 'internal_error', details: usernameCheckErr.message }, 500);
  }

  if (existingProfile) {
    return jsonWithCors({ error: 'username_taken' }, 409);
  }

  // ── 9. Create auth user ───────────────────────────────────────────────────
  const { data: newAuthUser, error: createAuthErr } = await adminClient.auth.admin.createUser({
    email:         `${username}@polybet.internal`,
    password,
    email_confirm: true,
  });

  if (createAuthErr || !newAuthUser?.user) {
    return jsonWithCors(
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
    return jsonWithCors({ error: 'internal_error', details: profileInsertErr.message }, 500);
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
      return jsonWithCors({ error: 'internal_error', details: managerInsertErr.message }, 500);
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
        return jsonWithCors({ error: 'internal_error', details: linkInsertErr.message }, 500);
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
      return jsonWithCors({ error: 'internal_error', details: balanceInsertErr.message }, 500);
    }
  }

  // ── 12. Return success ────────────────────────────────────────────────────
  return jsonWithCors({
    success:           true,
    id:                newUserId,
    username,
    generatedPassword: password,
  });
});
