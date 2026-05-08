import type { PostgrestError } from '@supabase/supabase-js';

/** Postgres returns 42P01 (relation does not exist) when a view/table the
 * query references hasn't been deployed yet. PostgREST surfaces it via
 * PGRST205 + the relation name in the error message. Use this to swallow
 * that specific case into a fallback when a feature is opt-in. */
export function isMissingRelationError(
  error: PostgrestError | null,
  relationName: string,
): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return typeof error.message === 'string' && new RegExp(relationName, 'i').test(error.message);
}
