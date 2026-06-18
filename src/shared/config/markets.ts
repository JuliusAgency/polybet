// Cadence of the per-client `refresh-markets` edge call (Gamma fetch → DB). Kept
// as a low-frequency safety gap-filler for markets the market-tracker hasn't
// subscribed yet — NOT the price-display cadence (see MARKETS_PRICE_POLL_INTERVAL_MS).
export const MARKETS_REFRESH_INTERVAL_MS = 30_000;
// Cheap DB price re-read cadence (feed + bet page). The market-tracker keeps
// market_outcomes ~1s fresh via the CLOB websocket, so the client only needs to
// re-read the DB this often to show near-live prices — no extra Gamma/edge load.
export const MARKETS_PRICE_POLL_INTERVAL_MS = 3_000;
export const MARKETS_REFRESH_MAX_IDS = 20;
export const MARKETS_STALE_THRESHOLD_MS = 300_000; // 5 min
// Markets per page for infinite scroll.
export const MARKETS_PAGE_LIMIT = 50;
