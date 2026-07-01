import type { Market, MarketOutcome } from '@/entities/market';
import type { GameTeam } from '@/entities/event';
import type { WorldCupGame } from '@/features/bet';

// A game's moneyline laid out for rendering: one entry per team plus an optional
// draw market, each resolved to the binary "Yes" outcome to bet on.
export interface MoneylineSlot {
  team: GameTeam;
  market: Market | null;
  outcome: MarketOutcome | null;
}

export interface GameView {
  game: WorldCupGame;
  teams: GameTeam[];
  teamSlots: MoneylineSlot[];
  draw: { market: Market; outcome: MarketOutcome } | null;
}

/**
 * Format a 0..1 share price as whole cents for the compact Games chips
 * (Polymarket parity: 0.665 -> "67¢"). The rest of the app uses
 * formatSharePrice (one decimal); the Games card mirrors Polymarket's
 * rounded chips, so it has its own formatter.
 */
export function formatOddCents(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return '–';
  const clamped = Math.max(0, Math.min(1, price));
  return `${Math.round(clamped * 100)}¢`;
}

/**
 * Pick a readable text token for a team-coloured button background. Parses a
 * `#rgb`/`#rrggbb` hex, computes perceived luminance and returns dark text on
 * light backgrounds and light text on dark ones. Falls back to the on-accent
 * token for missing/invalid colours (the button then uses --color-accent as
 * its background).
 */
export function readableTextColor(hex: string | null | undefined): string {
  const ON_ACCENT = 'var(--color-bg-base)';
  if (!hex) return ON_ACCENT;

  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return ON_ACCENT;

  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Perceived luminance (ITU-R BT.601). >0.6 => light background -> dark text.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0b0b0c' : '#ffffff';
}

/** The binary "Yes" outcome of a market (falls back to the first outcome). */
export function yesOutcome(market: Market): MarketOutcome | null {
  if (!market.market_outcomes || market.market_outcomes.length === 0) return null;
  return (
    market.market_outcomes.find((o) => o.name.trim().toLowerCase() === 'yes') ??
    market.market_outcomes[0]
  );
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Canonical key for matching a team name to a moneyline market's `group_label`.
 * Polymarket is inconsistent across the two: an event's team can be named
 * "Bosnia and Herzegovina" while its market label is "Bosnia-Herzegovina". This
 * collapses the connective word ("and"/"&") and all separators/punctuation so
 * the two forms compare equal. Word-boundary on "and" keeps names like "Andorra"
 * intact.
 */
function canon(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\band\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * A moneyline market is the draw leg when its label follows Polymarket's
 * "Draw (X vs. Y)" convention. Detecting the draw structurally (by label) rather
 * than as "the market not matched to a team" prevents an unmatched team market
 * from being mistaken for the draw.
 */
function isDrawLabel(value: string | null | undefined): boolean {
  return /^\s*draw\b/i.test(value ?? '');
}

/**
 * Order teams home-first (Polymarket convention) and fall back to input order
 * when `ordering` is absent.
 */
export function orderedTeams(teams: GameTeam[] | null | undefined): GameTeam[] {
  if (!teams || teams.length === 0) return [];
  const rank = (t: GameTeam): number =>
    norm(t.ordering) === 'home' ? 0 : norm(t.ordering) === 'away' ? 1 : 2;
  return [...teams].sort((a, b) => rank(a) - rank(b));
}

/**
 * Build a render-ready view of a game: each team paired with its moneyline
 * market + Yes outcome, plus the draw market when present. Pure — unit tested.
 */
export function toGameView(game: WorldCupGame): GameView {
  const teams = orderedTeams(game.event.teams);

  // Team markets are everything except the draw leg; the draw is identified by
  // its label so an unmatched team market can never be mistaken for it.
  const teamMarkets = game.moneyline.filter((m) => !isDrawLabel(m.group_label));

  // First pass: match each team to a team market by a punctuation-tolerant key
  // ("Bosnia and Herzegovina" === "Bosnia-Herzegovina").
  const claimed = new Set<string>();
  const teamSlots: MoneylineSlot[] = teams.map((team) => {
    const market =
      teamMarkets.find((m) => !claimed.has(m.id) && canon(m.group_label) === canon(team.name)) ??
      null;
    if (market) claimed.add(market.id);
    return { team, market, outcome: market ? yesOutcome(market) : null };
  });

  // Safety net for future label drift: if exactly one team and exactly one team
  // market are still unmatched, pair them (the lone leftover is unambiguous).
  const unmatchedSlots = teamSlots.filter((s) => !s.market);
  const leftoverMarkets = teamMarkets.filter((m) => !claimed.has(m.id));
  if (unmatchedSlots.length === 1 && leftoverMarkets.length === 1) {
    const slot = unmatchedSlots[0];
    const market = leftoverMarkets[0];
    slot.market = market;
    slot.outcome = yesOutcome(market);
    claimed.add(market.id);
  }

  // The draw market follows Polymarket's "Draw (X vs. Y)" convention. Only
  // meaningful for 3-way (football) games.
  const drawMarket = game.moneyline.find((m) => isDrawLabel(m.group_label)) ?? null;
  const drawOutcome = drawMarket ? yesOutcome(drawMarket) : null;
  const draw = drawMarket && drawOutcome ? { market: drawMarket, outcome: drawOutcome } : null;

  return { game, teams, teamSlots, draw };
}

/** Game lifecycle state for the Games tab badge + bet gating. */
export type GameStatus = 'live' | 'upcoming' | 'final';

/**
 * Upper bound on how long after the *scheduled* kickoff a game can still be
 * "live". Sized for the worst realistic case so a genuinely in-play match is
 * never prematurely flipped to 'final' (which would disable betting mid-game):
 * a knockout going the distance — 90' regulation + ~15' halftime + stoppage +
 * 30' extra time + break/stoppage + a penalty shootout ≈ 3h of play — plus a
 * buffer for pre-kickoff delays (the timestamp is the *scheduled* start). Erring
 * long is safe: once the sync closes the market the `!open` check flips it to
 * 'final' immediately; this bound only catches games the sync left stale-open.
 */
export const LIVE_WINDOW_MS = 4.5 * 60 * 60 * 1000;

/**
 * Classify a game for the Live/Closed badge + bet gating. A game is 'live' ONLY
 * while it is actually being played — kickoff has passed and we are still within
 * the play window. Before kickoff it is 'upcoming'; with no open market, or once
 * the play window has elapsed (even if a stale market is still nominally open),
 * it is 'final'. This upper bound is what stops a finished game whose markets the
 * sync has not yet closed from showing "Live" indefinitely. `now` is injectable
 * for tests.
 */
export function gameStatus(game: WorldCupGame, now: number = Date.now()): GameStatus {
  const open = game.moneyline.some((m) => m.status === 'open');
  if (!open) return 'final';

  const iso = game.event.game_start_time;
  const kickoff = iso ? Date.parse(iso) : NaN;
  // Unknown kickoff: we cannot assert the game is playing in real time, so it is
  // never 'live'.
  if (!Number.isFinite(kickoff)) return 'upcoming';
  if (now < kickoff) return 'upcoming';
  if (now < kickoff + LIVE_WINDOW_MS) return 'live';
  return 'final';
}

/** A day-bucket of games for the Games feed (date header + its games). */
export interface GameDateGroup {
  /** ISO date key (YYYY-MM-DD in the viewer's locale) used for React keys. */
  key: string;
  /** Epoch ms of the day start, for stable ordering. */
  sortValue: number;
  games: WorldCupGame[];
}

/**
 * Bucket games by their kickoff calendar day, ascending. Games without a
 * start time fall into a trailing "scheduled" bucket (key '').
 */
export function groupGamesByDate(games: WorldCupGame[]): GameDateGroup[] {
  const buckets = new Map<string, GameDateGroup>();

  for (const game of games) {
    const iso = game.event.game_start_time;
    const date = iso ? new Date(iso) : null;
    const key =
      date && !Number.isNaN(date.getTime())
        ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
        : '';
    const sortValue =
      date && !Number.isNaN(date.getTime())
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
        : Number.MAX_SAFE_INTEGER;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, sortValue, games: [] };
      buckets.set(key, bucket);
    }
    bucket.games.push(game);
  }

  return [...buckets.values()].sort((a, b) => a.sortValue - b.sortValue);
}
