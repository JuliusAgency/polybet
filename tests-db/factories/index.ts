import type { PoolClient } from 'pg';

// Test factories: build small, fully-typed fixture rows directly via SQL.
//
// They take a PoolClient so the inserts ride inside the calling test's
// `withTransaction(...)` boundary — every row is rolled back at the end of
// the test and never persisted. NEVER call these against a real `pg.Pool`
// outside `withTransaction`; you will leak rows into your local DB.
//
// Triggers (markets_set_sort_volume, markets_set_tag_slugs, etc.) fire as
// usual on these inserts. Tests assert against derived columns to prove
// the denormalisation paths still hold under realistic shapes.

export interface EventInput {
  title?: string;
  category?: string | null;
  status?: 'open' | 'closed' | 'resolved' | 'archived';
  volume?: number;
  tag_slugs?: string[];
  polymarket_id?: string | null;
}

export interface SeededEvent {
  id: string;
  title: string;
  volume: number;
  tag_slugs: string[];
}

let eventCounter = 0;
let marketCounter = 0;
let outcomeCounter = 0;

export async function seedEvent(c: PoolClient, input: EventInput = {}): Promise<SeededEvent> {
  eventCounter += 1;
  const title = input.title ?? `factory-event-${eventCounter}`;
  const category = input.category ?? 'Politics';
  const status = input.status ?? 'open';
  const volume = input.volume ?? 1_000_000;
  const tagSlugs = input.tag_slugs ?? ['politics'];
  const polymarketId = input.polymarket_id ?? null;

  const res = await c.query<{ id: string; title: string; volume: string; tag_slugs: string[] }>(
    `INSERT INTO events (title, category, status, volume, tag_slugs, polymarket_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, title, volume, tag_slugs`,
    [title, category, status, volume, tagSlugs, polymarketId]
  );
  const row = res.rows[0];
  return { id: row.id, title: row.title, volume: Number(row.volume), tag_slugs: row.tag_slugs };
}

export interface MarketInput {
  event_id?: string | null;
  question?: string;
  polymarket_id?: string;
  status?: 'open' | 'closed' | 'resolved';
  category?: string | null;
  volume?: number;
  group_label?: string | null;
}

export interface SeededMarket {
  id: string;
  polymarket_id: string;
  question: string;
  sort_volume: number;
  tag_slugs: string[];
}

export async function seedMarket(c: PoolClient, input: MarketInput = {}): Promise<SeededMarket> {
  marketCounter += 1;
  const polymarketId = input.polymarket_id ?? `pm-factory-${marketCounter}`;
  const question = input.question ?? `factory-market-${marketCounter}?`;
  const status = input.status ?? 'open';
  const category = input.category ?? 'Politics';

  const res = await c.query<{
    id: string;
    polymarket_id: string;
    question: string;
    sort_volume: string;
    tag_slugs: string[];
  }>(
    `INSERT INTO markets (polymarket_id, question, status, category, event_id, volume, group_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, polymarket_id, question, sort_volume, tag_slugs`,
    [
      polymarketId,
      question,
      status,
      category,
      input.event_id ?? null,
      input.volume ?? null,
      input.group_label ?? null,
    ]
  );
  const row = res.rows[0];
  return {
    id: row.id,
    polymarket_id: row.polymarket_id,
    question: row.question,
    sort_volume: Number(row.sort_volume),
    tag_slugs: row.tag_slugs ?? [],
  };
}

export interface OutcomeInput {
  market_id: string;
  name?: string;
  odds?: number;
  effective_odds?: number;
}

export async function seedOutcome(
  c: PoolClient,
  input: OutcomeInput
): Promise<{ id: string; name: string }> {
  outcomeCounter += 1;
  const name = input.name ?? `Outcome ${outcomeCounter}`;
  const odds = input.odds ?? 2;
  const effective = input.effective_odds ?? odds;
  const res = await c.query<{ id: string; name: string }>(
    `INSERT INTO market_outcomes (market_id, name, odds, effective_odds)
     VALUES ($1, $2, $3, $4) RETURNING id, name`,
    [input.market_id, name, odds, effective]
  );
  return res.rows[0];
}

/** Quick combo: event + one market attached. Used by feed/E2E setup specs. */
export async function seedEventWithMarket(
  c: PoolClient,
  evt: EventInput = {},
  mkt: Omit<MarketInput, 'event_id'> = {}
): Promise<{ event: SeededEvent; market: SeededMarket }> {
  const event = await seedEvent(c, evt);
  const market = await seedMarket(c, { ...mkt, event_id: event.id });
  return { event, market };
}
