import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './msw/server';

// Vite-injected build constant — not present in test runtime.
vi.stubGlobal('__APP_VERSION__', '0.0.0-test');

// Supabase client throws at import time if these are absent (see
// src/shared/api/supabase/client.ts). Stub them once for every component test.
vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54421');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
