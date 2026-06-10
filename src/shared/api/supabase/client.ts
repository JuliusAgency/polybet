import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] Missing environment variables. ' +
      'Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

// Store the auth session in sessionStorage rather than the supabase-js default
// (localStorage). This scopes the access/refresh token to the browser tab and
// clears it on tab close, shrinking the window in which an XSS payload or a
// malicious extension can exfiltrate a live session. Trade-off: users must
// re-authenticate when they open a fresh tab. Falls back to the in-memory
// default if sessionStorage is unavailable (e.g. hardened private modes).
const authStorage =
  typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
