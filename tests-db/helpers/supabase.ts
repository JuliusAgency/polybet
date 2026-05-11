import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEST_ANON_KEY, TEST_SERVICE_ROLE_KEY, TEST_SUPABASE_URL } from '../config';

// Service-role client bypasses RLS. Use for fixture setup or for tests
// asserting trigger/edge behaviour, NEVER for RLS-policy tests — those
// need the anon client below.
let service: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!service) {
    service = createClient(TEST_SUPABASE_URL, TEST_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return service;
}

/**
 * Fresh anon client per call — RLS policies depend on the JWT in the
 * request, so reusing one client across tests with different signed-in
 * users would leak auth state. Pass an access_token to act as a specific
 * user, or leave undefined to send raw anon requests.
 */
export function getAnonClient(accessToken?: string): SupabaseClient {
  return createClient(TEST_SUPABASE_URL, TEST_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}
