export type EdgeUserRole = 'super_admin' | 'manager' | 'user';

export interface EdgeAuthorizationContext {
  authHeader: string | null;
  callerUserId: string | null;
  callerRole: EdgeUserRole | null;
  serviceRoleAuthorized?: boolean;
  authError?: string | null;
  profileError?: string | null;
}

export interface EdgeAuthorizationOptions {
  allowServiceRole?: boolean;
  allowedRoles?: EdgeUserRole[];
}

export type EdgeAuthorizationResult =
  | {
      ok: true;
      callerId: string | null;
      callerRole: EdgeUserRole | null;
      isServiceRole: boolean;
    }
  | {
      ok: false;
      status: 401 | 403 | 500;
      body: { error: string; details?: string };
    };

export function authorizeEdgeRequest(
  context: EdgeAuthorizationContext,
  options: EdgeAuthorizationOptions = {},
): EdgeAuthorizationResult {
  const { allowServiceRole = false, allowedRoles } = options;

  if (allowServiceRole && context.serviceRoleAuthorized) {
    return {
      ok: true,
      callerId: context.callerUserId,
      callerRole: context.callerRole,
      isServiceRole: true,
    };
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

  if (allowedRoles && (!context.callerRole || !allowedRoles.includes(context.callerRole))) {
    return { ok: false, status: 403, body: { error: 'Forbidden' } };
  }

  return {
    ok: true,
    callerId: context.callerUserId,
    callerRole: context.callerRole,
    isServiceRole: false,
  };
}
