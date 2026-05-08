import type { QueryClient } from '@tanstack/react-query';
import { adminBetLimitSettingsQueryKey } from './useBetLimitSettings';
import { allLimitsQueryKey } from './useAllLimitsData';

const adminManagersQueryKey = ['admin', 'managers'] as const;
const adminManagerUsersQueryKey = ['admin', 'manager-users'] as const;

export type BetLimitScope = 'global' | 'manager' | 'user';

/** After any bet-limit write the whole admin tree may shift — invalidate every
 * cache that derives from limits. The 'user' scope skips the managers list
 * because user-level limits don't change manager rows. */
export async function invalidateAllBetLimitCaches(
  qc: QueryClient,
  scope: BetLimitScope,
): Promise<void> {
  const keys: ReadonlyArray<readonly unknown[]> =
    scope === 'user'
      ? [adminBetLimitSettingsQueryKey, adminManagerUsersQueryKey, allLimitsQueryKey]
      : [adminBetLimitSettingsQueryKey, adminManagersQueryKey, adminManagerUsersQueryKey, allLimitsQueryKey];
  await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}
