interface SyncStatsSnapshot {
  markets_synced: number;
  outcomes_updated: number;
  markets_settled: number;
  errors: string[];
}

export function buildStartedProgressUpdate(maxPages: number) {
  return {
    status: 'running' as const,
    phase: 'starting' as const,
    max_pages: maxPages,
    progress_current: 0,
    progress_total: 0,
    error_message: null,
    finished_at: null,
  };
}

export function buildFetchedProgressUpdate(activeCount: number, resolvedCount: number) {
  return {
    phase: activeCount > 0 ? ('syncing_active' as const) : ('syncing_resolved' as const),
    progress_current: 0,
    progress_total: activeCount + resolvedCount,
  };
}

export function buildIncrementedProgressUpdate(params: {
  processedCount: number;
  activeCount: number;
  totalCount: number;
}) {
  const { processedCount, activeCount, totalCount } = params;

  return {
    progress_current: processedCount,
    progress_total: totalCount,
    phase:
      processedCount >= activeCount
        ? ('syncing_resolved' as const)
        : ('syncing_active' as const),
  };
}

export function buildCompletedProgressUpdate(params: {
  processedCount: number;
  totalCount: number;
  stats: SyncStatsSnapshot;
}) {
  const { processedCount, totalCount, stats } = params;
  const hasErrors = stats.errors.length > 0;

  return {
    status: hasErrors ? ('completed_with_warnings' as const) : ('completed' as const),
    phase: hasErrors ? ('completed_with_warnings' as const) : ('completed' as const),
    progress_current: totalCount === 0 ? processedCount : totalCount,
    progress_total: totalCount,
    markets_synced: stats.markets_synced,
    outcomes_updated: stats.outcomes_updated,
    markets_settled: stats.markets_settled,
    errors: stats.errors,
    error_message: hasErrors ? stats.errors[0] : null,
    finished_at: new Date().toISOString(),
  };
}

export function buildFailedProgressUpdate(message: string, stats: SyncStatsSnapshot) {
  return {
    status: 'failed' as const,
    phase: 'failed' as const,
    markets_synced: stats.markets_synced,
    outcomes_updated: stats.outcomes_updated,
    markets_settled: stats.markets_settled,
    errors: [...stats.errors, message],
    error_message: message,
    finished_at: new Date().toISOString(),
  };
}
