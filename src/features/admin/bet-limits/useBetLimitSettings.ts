import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export type BetLimitSource = 'user' | 'manager' | 'global' | null;
export type ManagerBetLimitSource = 'manager' | 'global' | null;

interface BetLimitSettingValue {
  global_max_bet?: unknown;
}

interface SystemSettingRow {
  key: string;
  value: BetLimitSettingValue | null;
}

interface ManagerLimitRow {
  id: string;
  max_bet_limit: number | string | null;
}

interface ManagerUserLinkRow {
  manager_id?: string;
  user_id: string;
}

interface UserLimitRow {
  id: string;
  max_bet_limit: number | string | null;
}

export interface GlobalBetLimitRecord {
  key: string;
  value: BetLimitSettingValue | null;
  maxBetLimit: number | null;
}

export interface ManagerBetLimitRecord {
  managerId: string;
  maxBetLimit: number | null;
}

export interface UserBetLimitRecord {
  userId: string;
  managerId: string;
  maxBetLimit: number | null;
}

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

export interface BetLimitSettingsData {
  global: GlobalBetLimitRecord;
  manager: ManagerBetLimitRecord | null;
  users: UserBetLimitRecord[];
  effective: {
    manager: EffectiveManagerBetLimit | null;
    users: EffectiveUserBetLimit[];
  };
}

export const betLimitSettingsQueryKey = (managerId: string) =>
  ['admin', 'bet-limit-settings', managerId] as const;

export const adminBetLimitSettingsQueryKey = ['admin', 'bet-limit-settings'] as const;

const normalizePositiveLimit = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
};

const deriveManagerEffectiveLimit = (
  managerId: string,
  managerLimit: number | null,
  globalLimit: number | null,
): EffectiveManagerBetLimit => {
  if (managerLimit != null) {
    return {
      managerId,
      effectiveMaxBetLimit: managerLimit,
      source: 'manager',
    };
  }

  if (globalLimit != null) {
    return {
      managerId,
      effectiveMaxBetLimit: globalLimit,
      source: 'global',
    };
  }

  return {
    managerId,
    effectiveMaxBetLimit: null,
    source: null,
  };
};

const deriveUserEffectiveLimit = (
  user: UserBetLimitRecord,
  managerLimit: number | null,
  globalLimit: number | null,
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

const fetchBetLimitSettings = async (managerId: string): Promise<BetLimitSettingsData> => {
  const { data: globalSettingData, error: globalSettingError } = await supabase
    .from('system_settings')
    .select('key, value')
    .eq('key', 'bet_limits')
    .maybeSingle();

  if (globalSettingError) throw new Error(globalSettingError.message);

  const globalSetting = (globalSettingData as SystemSettingRow | null) ?? {
    key: 'bet_limits',
    value: null,
  };

  const globalMaxBetLimit = normalizePositiveLimit(globalSetting.value?.global_max_bet);

  const { data: managerData, error: managerError } = await supabase
    .from('managers')
    .select('id, max_bet_limit')
    .eq('id', managerId)
    .maybeSingle();

  if (managerError) throw new Error(managerError.message);

  const managerRow = managerData as ManagerLimitRow | null;
  const manager = managerRow
    ? {
        managerId: managerRow.id,
        maxBetLimit: normalizePositiveLimit(managerRow.max_bet_limit),
      }
    : null;

  const { data: linkData, error: linkError } = await supabase
    .from('manager_user_links')
    .select('user_id')
    .eq('manager_id', managerId);

  if (linkError) throw new Error(linkError.message);

  const links = (linkData as ManagerUserLinkRow[] | null) ?? [];
  const userIds = links.map((link) => link.user_id);
  const managerFloorByUserId = new Map<string, number | null>();

  let users: UserBetLimitRecord[] = [];

  if (userIds.length > 0) {
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id, max_bet_limit')
      .in('id', userIds)
      .eq('role', 'user');

    if (userError) throw new Error(userError.message);

    users = ((userData as UserLimitRow[] | null) ?? [])
      .map((user) => ({
        userId: user.id,
        managerId,
        maxBetLimit: normalizePositiveLimit(user.max_bet_limit),
      }))
      .sort((left, right) => left.userId.localeCompare(right.userId));

    const { data: allLinkData, error: allLinkError } = await supabase
      .from('manager_user_links')
      .select('user_id, manager_id')
      .in('user_id', userIds);

    if (allLinkError) throw new Error(allLinkError.message);

    const allLinks = (allLinkData as ManagerUserLinkRow[] | null) ?? [];
    const linkedManagerIds = Array.from(
      new Set(
        allLinks
          .map((link) => link.manager_id)
          .filter((linkedManagerId): linkedManagerId is string => !!linkedManagerId),
      ),
    );

    if (linkedManagerIds.length > 0) {
      const { data: linkedManagerData, error: linkedManagerError } = await supabase
        .from('managers')
        .select('id, max_bet_limit')
        .in('id', linkedManagerIds);

      if (linkedManagerError) throw new Error(linkedManagerError.message);

      const managerLimitById = new Map<string, number | null>(
        ((linkedManagerData as ManagerLimitRow[] | null) ?? []).map((linkedManager) => [
          linkedManager.id,
          normalizePositiveLimit(linkedManager.max_bet_limit),
        ]),
      );

      for (const link of allLinks) {
        if (!link.manager_id) continue;

        const managerLimit = managerLimitById.get(link.manager_id) ?? null;
        if (managerLimit == null) continue;

        const currentFloor = managerFloorByUserId.get(link.user_id) ?? null;
        managerFloorByUserId.set(
          link.user_id,
          currentFloor == null ? managerLimit : Math.min(currentFloor, managerLimit),
        );
      }
    }
  }

  return {
    global: {
      key: globalSetting.key,
      value: globalSetting.value,
      maxBetLimit: globalMaxBetLimit,
    },
    manager,
    users,
    effective: {
      manager: manager
        ? deriveManagerEffectiveLimit(manager.managerId, manager.maxBetLimit, globalMaxBetLimit)
        : null,
      users: users.map((user) =>
        deriveUserEffectiveLimit(
          user,
          managerFloorByUserId.get(user.userId) ?? null,
          globalMaxBetLimit,
        ),
      ),
    },
  };
};

export function useBetLimitSettings(managerId: string) {
  return useQuery({
    queryKey: betLimitSettingsQueryKey(managerId),
    queryFn: () => fetchBetLimitSettings(managerId),
    enabled: !!managerId,
  });
}
