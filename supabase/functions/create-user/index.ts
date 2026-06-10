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
  if (!body.role) missingFields.push('role');
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
    console.error('[create-user] username check failed:', usernameCheckErr.message);
    return jsonWithCors({ error: 'internal_error' }, 500);
  }

  if (existingProfile) {
    return jsonWithCors({ error: 'username_taken' }, 409);
  }

  // ── 9. Create auth user ───────────────────────────────────────────────────
  const { data: newAuthUser, error: createAuthErr } = await adminClient.auth.admin.createUser({
    email: `${username}@polybet.internal`,
    password,
    email_confirm: true,
  });

  if (createAuthErr || !newAuthUser?.user) {
    console.error(
      '[create-user] auth.admin.createUser failed:',
      createAuthErr?.message ?? 'no user returned'
    );
    return jsonWithCors({ error: 'internal_error' }, 500);
  }

  const newUserId = newAuthUser.user.id;

  // Split the single full-name field into first/last (first whitespace-delimited
  // token -> first_name, remainder -> last_name). Mirrors the backfill in
  // migration 20260524100940 so profiles stay editable via the split-name UI.
  const trimmedFullName = (fullName ?? '').trim();
  const firstSpace = trimmedFullName.indexOf(' ');
  const firstName = firstSpace === -1 ? trimmedFullName : trimmedFullName.slice(0, firstSpace);
  const lastName = firstSpace === -1 ? '' : trimmedFullName.slice(firstSpace + 1).trim();

  // ── 10. Insert into profiles ──────────────────────────────────────────────
  const { error: profileInsertErr } = await adminClient.from('profiles').insert({
    id: newUserId,
    username,
    full_name: trimmedFullName,
    first_name: firstName,
    last_name: lastName,
    role,
    phone: phone ?? null,
    notes: notes ?? null,
    is_active: true,
    created_by: callerId,
  });

  if (profileInsertErr) {
    // Attempt cleanup: remove the auth user we just created
    await adminClient.auth.admin.deleteUser(newUserId);
    console.error('[create-user] profiles insert failed:', profileInsertErr.message);
    return jsonWithCors({ error: 'internal_error' }, 500);
  }

  // ── 11. Role-specific inserts ─────────────────────────────────────────────
  if (role === 'manager') {
    const { error: managerInsertErr } = await adminClient.from('managers').insert({
      id: newUserId,
      balance: 0,
      margin: margin ?? 0,
      max_bet_limit: 0,
      max_win_limit: 0,
    });

    if (managerInsertErr) {
      // Attempt cleanup
      await adminClient.from('profiles').delete().eq('id', newUserId);
      await adminClient.auth.admin.deleteUser(newUserId);
      console.error('[create-user] managers insert failed:', managerInsertErr.message);
      return jsonWithCors({ error: 'internal_error' }, 500);
    }
  } else {
    // role === 'user'
    if (callerRole === 'manager') {
      const { error: linkInsertErr } = await adminClient.from('manager_user_links').insert({
        manager_id: callerId,
        user_id: newUserId,
      });

      if (linkInsertErr) {
        // Attempt cleanup
        await adminClient.from('profiles').delete().eq('id', newUserId);
        await adminClient.auth.admin.deleteUser(newUserId);
        console.error('[create-user] manager_user_links insert failed:', linkInsertErr.message);
        return jsonWithCors({ error: 'internal_error' }, 500);
      }
    }
    // If super_admin creates a user, skip manager_user_links (not applicable in this sprint)

    const { error: balanceInsertErr } = await adminClient.from('balances').insert({
      user_id: newUserId,
      available: 0,
      in_play: 0,
    });

    if (balanceInsertErr) {
      // Attempt cleanup
      if (callerRole === 'manager') {
        await adminClient.from('manager_user_links').delete().eq('user_id', newUserId);
      }
      await adminClient.from('profiles').delete().eq('id', newUserId);
      await adminClient.auth.admin.deleteUser(newUserId);
      console.error('[create-user] balances insert failed:', balanceInsertErr.message);
      return jsonWithCors({ error: 'internal_error' }, 500);
    }
  }

  // ── 12. Return success ────────────────────────────────────────────────────
  // Do NOT echo the password back: the caller supplied it and it would
  // otherwise be captured in edge-function request/response logs.
  return jsonWithCors({
    success: true,
    id: newUserId,
    username,
  });
});
