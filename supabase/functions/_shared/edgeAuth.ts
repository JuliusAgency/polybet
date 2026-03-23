import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authorizeEdgeRequest, type EdgeAuthorizationOptions, type EdgeUserRole } from './edgeAuthRules.ts';

interface EdgeSupabaseClients {
  adminClient: ReturnType<typeof createClient>;
  callerClient: ReturnType<typeof createClient>;
  serviceRoleKey: string;
}

type AuthorizeResult =
  | {
      ok: true;
      adminClient: ReturnType<typeof createClient>;
      callerId: string | null;
      callerRole: EdgeUserRole | null;
      isServiceRole: boolean;
    }
  | {
      ok: false;
      status: 401 | 403 | 500;
      body: { error: string; details?: string };
    };

function getSupabaseEnv() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return null;
  }

  return { supabaseUrl, serviceRoleKey, anonKey };
}

function createEdgeSupabaseClients(authHeader: string | null): EdgeSupabaseClients | null {
  const env = getSupabaseEnv();
  if (!env) {
    return null;
  }

  return {
    adminClient: createClient(env.supabaseUrl, env.serviceRoleKey),
    callerClient: createClient(env.supabaseUrl, env.anonKey, {
      global: { headers: { Authorization: authHeader ?? '' } },
    }),
    serviceRoleKey: env.serviceRoleKey,
  };
}

export async function authorizeEdgeCall(
  req: Request,
  options: EdgeAuthorizationOptions = {},
): Promise<AuthorizeResult> {
  const authHeader = req.headers.get('Authorization');
  const clients = createEdgeSupabaseClients(authHeader);

  if (!clients) {
    return {
      ok: false,
      status: 500,
      body: { error: 'internal_error', details: 'env_misconfigured' },
    };
  }

  const isServiceRoleRequest = authHeader === `Bearer ${clients.serviceRoleKey}`;

  if (options.allowServiceRole && isServiceRoleRequest) {
    return {
      ok: true,
      adminClient: clients.adminClient,
      callerId: null,
      callerRole: null,
      isServiceRole: true,
    };
  }

  const {
    data: { user: callerUser },
    error: callerAuthErr,
  } = await clients.callerClient.auth.getUser();

  const { data: callerProfile, error: profileErr } = callerUser
    ? await clients.adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .maybeSingle()
    : { data: null, error: null };

  const authResult = authorizeEdgeRequest({
    authHeader,
    callerUserId: callerUser?.id ?? null,
    callerRole: (callerProfile?.role as EdgeUserRole | null | undefined) ?? null,
    serviceRoleAuthorized: isServiceRoleRequest,
    authError: callerAuthErr?.message ?? null,
    profileError: profileErr?.message ?? null,
  }, options);

  if (!authResult.ok) {
    return authResult;
  }

  return {
    ok: true,
    adminClient: clients.adminClient,
    callerId: authResult.callerId,
    callerRole: authResult.callerRole,
    isServiceRole: authResult.isServiceRole,
  };
}
