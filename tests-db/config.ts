// Connection defaults for the local Supabase stack (after Layer-1 port shift
// to 544xx and project_id "polybet"). All values can be overridden via env —
// see TEST_PG_URL / TEST_SUPABASE_URL / TEST_SERVICE_ROLE_KEY / TEST_ANON_KEY.
//
// The hard-coded JWTs below are the well-known defaults the Supabase CLI
// emits when JWT_SECRET stays at its template value
// ("super-secret-jwt-token-with-at-least-32-characters-long"). They are NOT
// production secrets, they are not used in production, and they only work
// against the local container stack. If you rotated jwt_secret in
// config.toml, override via env.
//
// Verify against `supabase status` after a fresh start; if anon/service
// keys differ, export them in your shell or .env.test.

const env = process.env;

export const TEST_PG_URL =
  env.TEST_PG_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54422/postgres';

export const TEST_SUPABASE_URL = env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54421';

// Default keys for jwt_secret = "super-secret-jwt-token-with-at-least-32-characters-long".
// Re-run `supabase status` and copy from there if your jwt_secret was customised.
export const TEST_ANON_KEY =
  env.TEST_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const TEST_SERVICE_ROLE_KEY =
  env.TEST_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
