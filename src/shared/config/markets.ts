export const MARKETS_REFRESH_INTERVAL_MS = 30_000;
export const MARKETS_REFRESH_MAX_IDS = 20;
export const MARKETS_STALE_THRESHOLD_MS = 300_000; // 5 min
// Markets per page for infinite scroll.
export const MARKETS_PAGE_LIMIT = 50;

// Yes-side probability below this threshold is considered "long-tail":
// dimmed % text + emphasised No button (Polymarket-style). 0.01 == 1%,
// matches `formatProbability`'s "<1%" rendering boundary so the visual
// transition lines up with the textual one.
export const LONG_TAIL_PROBABILITY_THRESHOLD = 0.01;
