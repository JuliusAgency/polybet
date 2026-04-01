import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export type LimitSource = 'personal' | 'manager' | 'global' | null;
export type ManagerLimitSource = 'manager' | 'global' | null;

export interface UserLimitNode {
  userId: string;
  username: string;
  fullName: string | null;
  ownLimit: number | null;
  effectiveLimit: number | null;
  effectiveSource: LimitSource;
}

export interface ManagerLimitNode {
  managerId: string;
  username: string;
  fullName: string | null;
  ownLimit: number | null;
  effectiveLimit: number | null;
  effectiveSource: ManagerLimitSource;
  users: UserLimitNode[];
}

export interface LimitsTree {
  globalLimit: number | null;
  managers: ManagerLimitNode[];
}

export const allLimitsQueryKey = ['admin', 'all-limits'] as const;

const toPositive = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
};

const fetchAllLimitsData = async (): Promise<LimitsTree> => {
  // 1. Global limit
  const { data: settingData, error: settingError } = await supabase
    .from('system_settings')
    .select('key, value')
    .eq('key', 'bet_limits')
    .maybeSingle();
  if (settingError) throw new Error(settingError.message);

  const globalLimit = toPositive(
    (settingData?.value as Record<string, unknown> | null)?.global_max_bet ?? null,
  );

  // 2. All manager profiles + manager rows
  const { data: managerProfiles, error: mpError } = await supabase
    .from('profiles')
    .select('id, username, full_name')
    .eq('role', 'manager')
    .order('created_at', { ascending: false });
  if (mpError) throw new Error(mpError.message);
  if (!managerProfiles || managerProfiles.length === 0) {
    return { globalLimit, managers: [] };
  }

  const managerIds = managerProfiles.map((p) => p.id as string);

  const { data: managerRows, error: mrError } = await supabase
    .from('managers')
    .select('id, max_bet_limit')
    .in('id', managerIds);
  if (mrError) throw new Error(mrError.message);

  const managerLimitById = new Map<string, number | null>(
    (managerRows ?? []).map((m) => [m.id as string, toPositive(m.max_bet_limit)]),
  );

  // 3. All manager→user links
  const { data: links, error: linksError } = await supabase
    .from('manager_user_links')
    .select('manager_id, user_id')
    .in('manager_id', managerIds);
  if (linksError) throw new Error(linksError.message);

  const usersByManager = new Map<string, string[]>();
  for (const link of links ?? []) {
    const mid = link.manager_id as string;
    const uid = link.user_id as string;
    if (!usersByManager.has(mid)) usersByManager.set(mid, []);
    usersByManager.get(mid)!.push(uid);
  }

  // 4. All user profiles with limits
  const allUserIds = (links ?? []).map((l) => l.user_id as string);
  const userLimitById = new Map<
    string,
    { username: string; fullName: string | null; ownLimit: number | null }
  >();

  if (allUserIds.length > 0) {
    const { data: userProfiles, error: upError } = await supabase
      .from('profiles')
      .select('id, username, full_name, max_bet_limit')
      .in('id', allUserIds)
      .eq('role', 'user');
    if (upError) throw new Error(upError.message);

    for (const u of userProfiles ?? []) {
      userLimitById.set(u.id as string, {
        username: u.username as string,
        fullName: (u.full_name as string | null) ?? null,
        ownLimit: toPositive(u.max_bet_limit),
      });
    }
  }

  // 5. Build tree
  const managers: ManagerLimitNode[] = managerProfiles.map((mp) => {
    const managerId = mp.id as string;
    const ownLimit = managerLimitById.get(managerId) ?? null;

    let effectiveLimit: number | null;
    let effectiveSource: ManagerLimitSource;
    if (ownLimit != null) {
      effectiveLimit = ownLimit;
      effectiveSource = 'manager';
    } else if (globalLimit != null) {
      effectiveLimit = globalLimit;
      effectiveSource = 'global';
    } else {
      effectiveLimit = null;
      effectiveSource = null;
    }

    const userIds = usersByManager.get(managerId) ?? [];
    const users: UserLimitNode[] = userIds
      .map((userId) => {
        const u = userLimitById.get(userId);
        if (!u) return null;
        let uEffective: number | null;
        let uSource: LimitSource;
        if (u.ownLimit != null) {
          uEffective = u.ownLimit;
          uSource = 'personal';
        } else if (ownLimit != null) {
          uEffective = ownLimit;
          uSource = 'manager';
        } else if (globalLimit != null) {
          uEffective = globalLimit;
          uSource = 'global';
        } else {
          uEffective = null;
          uSource = null;
        }
        return {
          userId,
          username: u.username,
          fullName: u.fullName,
          ownLimit: u.ownLimit,
          effectiveLimit: uEffective,
          effectiveSource: uSource,
        } satisfies UserLimitNode;
      })
      .filter((u): u is UserLimitNode => u !== null);

    return {
      managerId,
      username: mp.username as string,
      fullName: (mp.full_name as string | null) ?? null,
      ownLimit,
      effectiveLimit,
      effectiveSource,
      users,
    };
  });

  return { globalLimit, managers };
};

export function useAllLimitsData() {
  return useQuery({
    queryKey: allLimitsQueryKey,
    queryFn: fetchAllLimitsData,
  });
}
