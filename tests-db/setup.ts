import { afterAll, beforeAll } from 'vitest';
import { closePool, pingDatabase } from './helpers/pg';
import { TEST_PG_URL } from './config';

// Fail fast with a helpful message when the local Supabase stack isn't up.
// Without this the first pg.connect() in a test throws ECONNREFUSED with
// no context, which sends people on a wild goose chase.
beforeAll(async () => {
  try {
    await pingDatabase();
  } catch (err) {
    throw new Error(
      [
        `tests-db: cannot reach Postgres at ${TEST_PG_URL}.`,
        '',
        'Start the local Supabase stack first:',
        '  npx supabase start',
        '',
        'Verify it is up:',
        '  npx supabase status   # API on :54421, DB on :54422',
        '',
        `Underlying error: ${(err as Error).message}`,
      ].join('\n')
    );
  }
});

afterAll(async () => {
  await closePool();
});
