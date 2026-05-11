import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Two test projects:
//   - "component": React widgets/hooks under jsdom with MSW.
//   - "db": integration tests against the local Supabase stack via pg.
//
// Use `vitest run --project component` / `--project db` to run a single
// tier, or `vitest run` for both. The DB project does NOT load MSW and
// does NOT need jsdom — it talks to a real Postgres on 127.0.0.1:54422.
//
// Why a separate vitest.config.ts (not test inside vite.config.ts):
// vite.config.ts is loaded by `vite build`/`vite preview` in production;
// keeping vitest deps out of that path means the prod build never has to
// resolve jsdom/msw/pg.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./tests-component/setup.ts'],
          include: ['tests-component/**/*.test.{ts,tsx}'],
          css: false,
          restoreMocks: true,
          clearMocks: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          globals: true,
          setupFiles: ['./tests-db/setup.ts'],
          include: ['tests-db/**/*.test.ts'],
          // Force sequential file execution. Each DB test opens its own
          // transaction and rolls back, but running multiple files in
          // parallel against a single local Postgres can produce noisy
          // deadlocks on shared trigger paths during reset.
          fileParallelism: false,
          testTimeout: 15_000,
          hookTimeout: 15_000,
        },
      },
    ],
  },
});
