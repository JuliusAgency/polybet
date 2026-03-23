import type { SyncRunStatus } from '@/shared/types/database';

export const SYNC_SCOPE_OPTIONS = [
  { id: 'quick', maxPages: 1, labelKey: 'settlement.scope.quick' },
  { id: 'balanced', maxPages: 5, labelKey: 'settlement.scope.balanced' },
  { id: 'deep', maxPages: 10, labelKey: 'settlement.scope.deep' },
  { id: 'all', maxPages: 0, labelKey: 'settlement.scope.all' },
] as const;

export function isSyncRunTerminal(status: SyncRunStatus) {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'failed';
}

export function isSyncRunProgressIndeterminate(params: {
  status: SyncRunStatus;
  progress_total: number;
}) {
  return params.status === 'running' && params.progress_total <= 0;
}

export function getSyncRunFreshness(params: {
  status: SyncRunStatus;
  updated_at: string | null | undefined;
  now?: Date;
  staleAfterSeconds?: number;
}) {
  const {
    status,
    updated_at,
    now = new Date(),
    staleAfterSeconds = 15,
  } = params;

  if (!updated_at) {
    return {
      secondsSinceUpdate: null,
      isStale: false,
    };
  }

  const updatedAt = new Date(updated_at);
  const secondsSinceUpdate = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / 1000));

  return {
    secondsSinceUpdate,
    isStale: status === 'running' && secondsSinceUpdate >= staleAfterSeconds,
  };
}

export function getSyncRunProgressPercent(params: {
  status: SyncRunStatus;
  progress_current: number;
  progress_total: number;
}) {
  const { status, progress_current, progress_total } = params;

  if (progress_total <= 0) {
    return status === 'completed' || status === 'completed_with_warnings' ? 100 : 0;
  }

  return Math.max(0, Math.min(100, Math.round((progress_current / progress_total) * 100)));
}
