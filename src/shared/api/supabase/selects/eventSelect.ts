// EVENT_SELECT — canonical projection of `events`. Used by useEventById +
// embedded as MARKET_EVENT_JOIN in market queries. Keep the two aligned.
export const EVENT_SELECT =
  'id, title, description, category, image_url, close_at, status, volume, tag_slug, tag_label, tag_slugs';
