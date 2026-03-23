import type { SyncRunStatus } from '@/shared/types/database';

export const SYNC_SCOPE_OPTIONS = [
  { id: 'quick', maxPages: 1, labelKey: 'settlement.scope.quick' },
  { id: 'balanced', maxPages: 5, labelKey: 'settlement.scope.balanced' },
  { id: 'deep', maxPages: 10, labelKey: 'settlement.scope.deep' },
  { id: 'all', maxPages: 0, labelKey: 'settlement.scope.all' },
] as const;

export function isSyncRunTerminal(status: SyncRunStatus) {
  return status === 'completed' || status === 'failed';
}

export function getSyncRunProgressPercent(params: {
  status: SyncRunStatus;
  progress_current: number;
  progress_total: number;
}) {
  const { status, progress_current, progress_total } = params;

  if (progress_total <= 0) {
    return status === 'completed' ? 100 : 0;
  }

  return Math.max(0, Math.min(100, Math.round((progress_current / progress_total) * 100)));
}
