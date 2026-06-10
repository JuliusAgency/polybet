import { describe, expect, it } from 'vitest';
import { getPool } from '../helpers/pg';

// Coverage for migration 20260610123702_revoke_report_builders_from_authenticated:
// the admin_build_*_dataset builders are SECURITY DEFINER LANGUAGE sql functions
// whose `_guard` CTE is dead code (Postgres elides unreferenced CTEs), so the
// REVOKE is the real access gate. `authenticated` must NOT be able to call them
// directly via PostgREST; the only entry point is the dispatcher
// admin_get_report_dataset, whose live plpgsql is_super_admin() check is the
// access control — it must KEEP EXECUTE for `authenticated`.
//
// Privilege checks are read-only — no withTransaction needed.

const REVOKED_BUILDERS = [
  'admin_build_managers_log_dataset(timestamptz, timestamptz)',
  'admin_build_system_summary_report_dataset(timestamptz, timestamptz)',
  'admin_build_bets_log_dataset(timestamptz, timestamptz)',
  'admin_build_system_dashboard_dataset(timestamptz, timestamptz)',
  // already revoked in 20260610115136 — asserted here so a future
  // CREATE FUNCTION (vs CREATE OR REPLACE) regression is caught too
  'admin_build_managers_report_dataset(timestamptz, timestamptz)',
];

const DISPATCHER = 'admin_get_report_dataset(text, timestamptz, timestamptz, uuid, uuid)';

async function hasExecute(role: string, fn: string): Promise<boolean> {
  const res = await getPool().query<{ ok: boolean }>(
    'SELECT has_function_privilege($1, $2, $3) AS ok',
    [role, fn, 'EXECUTE']
  );
  return res.rows[0].ok;
}

describe('report builder function privileges', () => {
  for (const fn of REVOKED_BUILDERS) {
    it(`authenticated has NO EXECUTE on ${fn.split('(')[0]}`, async () => {
      expect(await hasExecute('authenticated', fn)).toBe(false);
    });

    it(`anon has NO EXECUTE on ${fn.split('(')[0]}`, async () => {
      expect(await hasExecute('anon', fn)).toBe(false);
    });
  }

  it('dispatcher admin_get_report_dataset keeps EXECUTE for authenticated', async () => {
    expect(await hasExecute('authenticated', DISPATCHER)).toBe(true);
  });
});
