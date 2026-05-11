import { http, HttpResponse } from 'msw';

// Default empty REST/Realtime handlers — individual tests layer their own
// fixtures on top via server.use(). The intent is to make any uncovered
// network call FAIL loudly (onUnhandledRequest: 'error' in setup.ts) so
// tests stay deterministic.
//
// Why we keep this file even when empty: importing setupServer with zero
// args still works, but a named handlers array gives us one place to put
// truly global responses (e.g. /auth/v1/token refresh) later.
export const handlers = [
  // Catch-all for auth token refresh during render — prevents Supabase client
  // from spamming the network when a test mounts AuthProvider implicitly.
  http.post('http://127.0.0.1:54421/auth/v1/token', () =>
    HttpResponse.json({ access_token: 'test', refresh_token: 'test', user: null }, { status: 200 })
  ),
];
