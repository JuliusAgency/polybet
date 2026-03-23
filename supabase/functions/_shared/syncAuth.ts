export interface SyncAuthorizationContext {
  authHeader: string | null;
  callerUserId: string | null;
  callerRole: string | null;
  serviceRoleAuthorized?: boolean;
  authError?: string | null;
  profileError?: string | null;
}

export type SyncAuthorizationResult =
  | { ok: true; callerId: string | null }
  | { ok: false; status: 401 | 403 | 500; body: { error: string; details?: string } };

export function evaluateSyncAuthorization(
  context: SyncAuthorizationContext,
): SyncAuthorizationResult {
  if (context.serviceRoleAuthorized) {
    return { ok: true, callerId: context.callerUserId };
  }

  if (!context.authHeader) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }

  if (context.authError || !context.callerUserId) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }

  if (context.profileError) {
    return {
      ok: false,
      status: 500,
      body: { error: 'internal_error', details: context.profileError },
    };
  }

  if (context.callerRole !== 'super_admin') {
    return { ok: false, status: 403, body: { error: 'Forbidden' } };
  }

  return { ok: true, callerId: context.callerUserId };
}
