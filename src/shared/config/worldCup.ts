// Configuration for the World Cup tab (Games + Map surfaces).

// Internal category slug for the World Cup tab. Matches the curated tag in
// useAllowedCategoryTags and the market-tracker CATEGORY_WHITELIST. Centralised
// so the feed page, the Games hook, and any future World Cup surface agree.
export const WORLD_CUP_TAG_SLUG = 'world-cup';

/**
 * system_settings key that, when present, overrides the hardcoded fallback
 * below with the id of the "World Cup Winner" event to render on the map. Lets
 * an admin re-point the map to a freshly-synced event without a redeploy —
 * mirrors the `allowed_category_tags` setting read by useAllowedCategoryTags.
 *
 * Expected shape: `{ "key": "world_cup_winner_event_id", "value": "<uuid>" }`.
 */
export const WORLD_CUP_WINNER_EVENT_ID_SETTING = 'world_cup_winner_event_id';

/**
 * Fallback "World Cup Winner" event id, used when the system_settings override
 * is absent. This is the production event
 * (polybet-mu.vercel.app/events/a347cf56-…). Locally this event may not be
 * synced into the DB, in which case the map shows its empty state until the
 * event is synced or the setting points at a local event.
 */
export const WORLD_CUP_WINNER_EVENT_ID_FALLBACK = 'a347cf56-d259-445d-8981-30bfec30477a';
