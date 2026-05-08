import { EVENT_SELECT } from './eventSelect';

// MARKET_OUTCOMES_JOIN — embedded outcomes join with explicit FK alias.
// `market_outcomes!market_outcomes_market_id_fkey` is required because there
// are two FKs from market_outcomes to markets (market_id and winning_outcome_id),
// and PostgREST cannot disambiguate without the alias.
const MARKET_OUTCOMES_JOIN =
  'market_outcomes!market_outcomes_market_id_fkey(id, name, price, odds, effective_odds, updated_at, polymarket_token_id)';

// MARKET_EVENT_JOIN — left join used by the markets feed and by markets-by-ids.
// Built from EVENT_SELECT so the embedded event projection cannot drift from
// the standalone events query. Includes denormalized columns (tag_slugs,
// volume) needed for EventCard preview. See migrations 057/069 for rationale.
const MARKET_EVENT_JOIN = `event:event_id(${EVENT_SELECT})`;

// MARKET_SELECT_FULL — full market row + denormalized sort/trending columns +
// event join + outcomes. Used by useMarkets, useMarketsByIds, useEventsByIds,
// useMarketRefresh. ALL consumers must use the same fragment, otherwise the
// cache merge in useMarketRefresh may write rows that omit fields read by the UI.
export const MARKET_SELECT_FULL = `id, polymarket_id, question, status, winning_outcome_id, category, image_url, close_at, last_synced_at, created_at, volume, sort_volume, trending_rank, volume_24hr, event_id, group_label, tag_slugs, ${MARKET_EVENT_JOIN}, ${MARKET_OUTCOMES_JOIN}`;

// MARKET_SELECT_NO_EVENT — used by useEventById, which fetches the event row
// separately and inlines it client-side. Excludes feed-only columns
// (sort_volume, trending_rank, volume_24hr, tag_slugs).
export const MARKET_SELECT_NO_EVENT = `id, polymarket_id, question, status, winning_outcome_id, category, image_url, close_at, last_synced_at, created_at, volume, event_id, group_label, ${MARKET_OUTCOMES_JOIN}`;
