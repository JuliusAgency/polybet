import { describe, expect, it } from 'vitest';
import { withTransaction } from '../helpers/pg';
import { seedEventWithMarket, seedOutcome } from '../factories';

// Regression coverage for migration 20260609131610_book_updated_at_db_clock.
//
// place_bet / sell_position reject with "Market book is stale" when
// market_outcome_books.updated_at is older than 30s vs Postgres now(). That
// column used to be written with the BOOK WRITER's wall clock (quote-bet edge =
// Deno new Date(); market-tracker = Heroku clock), so cross-runtime clock skew
// could flip a fresh book to "stale" and reject a legitimate bet.
//
// The trigger trg_market_outcome_books_touch overwrites updated_at with the
// Postgres now() on every INSERT/UPDATE, so the value place_bet compares and the
// now() it compares against always come from the same clock. These tests prove
// the writer-supplied timestamp is ignored on both the INSERT and the UPDATE
// (upsert ON CONFLICT) paths.

describe('market_outcome_books.updated_at is Postgres-clock authoritative (migration 20260609131610)', () => {
  it('overrides a stale writer-supplied updated_at on INSERT', async () => {
    await withTransaction(async (c) => {
      const { market } = await seedEventWithMarket(c);
      const outcome = await seedOutcome(c, { market_id: market.id });

      // Writer claims the book was last updated in the year 2000.
      await c.query(
        `INSERT INTO market_outcome_books (polymarket_token_id, outcome_id, asks, bids, updated_at)
         VALUES ($1, $2, ARRAY[0.5, 100]::numeric[], '{}'::numeric[], '2000-01-01T00:00:00Z')`,
        ['tok-book-touch-insert', outcome.id]
      );

      const res = await c.query<{ age_seconds: number }>(
        `SELECT EXTRACT(EPOCH FROM (now() - updated_at)) AS age_seconds
         FROM market_outcome_books WHERE polymarket_token_id = $1`,
        ['tok-book-touch-insert']
      );

      // Despite the year-2000 payload, the stored value is ~now() (well within
      // the 30s staleness bound), so the staleness guard would NOT misfire.
      expect(Number(res.rows[0].age_seconds)).toBeLessThan(5);
    });
  });

  it('overrides a stale writer-supplied updated_at on UPDATE (upsert ON CONFLICT)', async () => {
    await withTransaction(async (c) => {
      const { market } = await seedEventWithMarket(c);
      const outcome = await seedOutcome(c, { market_id: market.id });

      await c.query(
        `INSERT INTO market_outcome_books (polymarket_token_id, outcome_id, asks, bids)
         VALUES ($1, $2, ARRAY[0.5, 100]::numeric[], '{}'::numeric[])`,
        ['tok-book-touch-update', outcome.id]
      );

      // Re-upsert with an ancient updated_at, exactly as a skewed writer would.
      await c.query(
        `INSERT INTO market_outcome_books (polymarket_token_id, outcome_id, asks, bids, updated_at)
         VALUES ($1, $2, ARRAY[0.6, 200]::numeric[], '{}'::numeric[], '2000-01-01T00:00:00Z')
         ON CONFLICT (polymarket_token_id)
         DO UPDATE SET asks = EXCLUDED.asks, updated_at = EXCLUDED.updated_at`,
        ['tok-book-touch-update', outcome.id]
      );

      const res = await c.query<{ age_seconds: number }>(
        `SELECT EXTRACT(EPOCH FROM (now() - updated_at)) AS age_seconds
         FROM market_outcome_books WHERE polymarket_token_id = $1`,
        ['tok-book-touch-update']
      );

      expect(Number(res.rows[0].age_seconds)).toBeLessThan(5);
    });
  });
});
