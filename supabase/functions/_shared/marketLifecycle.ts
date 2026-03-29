export function parseArchiveAfterHours(value: unknown, fallbackHours: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallbackHours;
}

export function buildArchiveCutoffIso(params: {
  archiveAfterHours: number;
  now?: Date;
}): string {
  const now = params.now ?? new Date();
  const cutoff = new Date(now.getTime() - params.archiveAfterHours * 60 * 60 * 1000);
  return cutoff.toISOString();
}
