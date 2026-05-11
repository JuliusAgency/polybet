import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Vite dev port — keep in sync with `npm run dev`.
const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER1_STATE = path.resolve(__dirname, 'e2e/.auth/user1.json');

// Pull live keys from `supabase status -o env` so the E2E stack is decoupled
// from the developer's local .env file. The Supabase CLI keeps publishable/
// secret keys in sync with whatever the local container actually serves,
// so this is the only stable source.
//
// If the local stack isn't up, fall back to an empty record — webServer
// will then surface a clear error and tests will fail at first navigation
// rather than silently authenticating against a stale .env.
function loadSupabaseEnv(): Record<string, string> {
  try {
    const raw = execSync('npx supabase status -o env', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)="?(.+?)"?$/);
      if (m) parsed[m[1]] = m[2];
    }
    const url = parsed.API_URL;
    // CLI variable name evolves; try both legacy (ANON_KEY) and current
    // (PUBLISHABLE_KEY) shapes.
    const anon = parsed.PUBLISHABLE_KEY ?? parsed.ANON_KEY;
    if (!url || !anon) return {};
    return { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anon };
  } catch {
    return {};
  }
}

const supabaseEnv = loadSupabaseEnv();

// Playwright manages the dev server lifecycle in CI. Locally we reuse a
// dev server that's already running to avoid the cold-start hit and to
// keep one HMR session across multiple `npx playwright test` invocations.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts$/,
    },
    {
      name: 'anon',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /smoke\.spec\.ts$/,
    },
    {
      name: 'user',
      use: {
        ...devices['Desktop Chrome'],
        storageState: USER1_STATE,
      },
      testMatch: /authed\/.*\.spec\.ts$/,
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --strictPort',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: supabaseEnv,
  },
});
