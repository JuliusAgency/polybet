// Canonical cascade types and pure derivation helpers for bet-limit waterfall:
// global → manager override → user override. Keeps the math testable in isolation.

export type BetLimitSource = 'user' | 'manager' | 'global' | null;
export type ManagerBetLimitSource = 'manager' | 'global' | null;

export interface EffectiveManagerBetLimit {
  managerId: string;
  effectiveMaxBetLimit: number | null;
  source: ManagerBetLimitSource;
}

export interface EffectiveUserBetLimit {
  userId: string;
  managerId: string;
  effectiveMaxBetLimit: number | null;
  source: BetLimitSource;
}

/** Parses and validates a raw DB value into a positive finite number, or null.
 * Rejects zero, negative, non-finite, and blank-string inputs so callers never
 * see a 0-limit masquerading as "no limit". */
export const normalizePositiveLimit = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
};

/** Resolves the effective bet limit for a manager using the cascade:
 * manager-own → global. */
export const deriveManagerEffectiveLimit = (
  managerId: string,
  managerLimit: number | null,
  globalLimit: number | null
): EffectiveManagerBetLimit => {
  if (managerLimit != null) {
    return { managerId, effectiveMaxBetLimit: managerLimit, source: 'manager' };
  }

  if (globalLimit != null) {
    return { managerId, effectiveMaxBetLimit: globalLimit, source: 'global' };
  }

  return { managerId, effectiveMaxBetLimit: null, source: null };
};

export interface UserBetLimitInput {
  userId: string;
  managerId: string;
  maxBetLimit: number | null;
}

/** Resolves the effective bet limit for a user using the cascade:
 * user-own → manager-floor → global. */
export const deriveUserEffectiveLimit = (
  user: UserBetLimitInput,
  managerLimit: number | null,
  globalLimit: number | null
): EffectiveUserBetLimit => {
  if (user.maxBetLimit != null) {
    return {
      userId: user.userId,
      managerId: user.managerId,
      effectiveMaxBetLimit: user.maxBetLimit,
      source: 'user',
    };
  }

  if (managerLimit != null) {
    return {
      userId: user.userId,
      managerId: user.managerId,
      effectiveMaxBetLimit: managerLimit,
      source: 'manager',
    };
  }

  if (globalLimit != null) {
    return {
      userId: user.userId,
      managerId: user.managerId,
      effectiveMaxBetLimit: globalLimit,
      source: 'global',
    };
  }

  return {
    userId: user.userId,
    managerId: user.managerId,
    effectiveMaxBetLimit: null,
    source: null,
  };
};
