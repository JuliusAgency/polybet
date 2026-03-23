export interface SyncStartResponse {
  run_id: string;
  success: boolean;
  accepted?: boolean;
}

export function parseSyncStartResponse(data: unknown): SyncStartResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Unexpected response shape from sync function');
  }

  const candidate = data as Partial<SyncStartResponse>;

  if (typeof candidate.run_id !== 'string' || typeof candidate.success !== 'boolean') {
    throw new Error('Unexpected response shape from sync function');
  }

  return {
    run_id: candidate.run_id,
    success: candidate.success,
    accepted: candidate.accepted,
  };
}
