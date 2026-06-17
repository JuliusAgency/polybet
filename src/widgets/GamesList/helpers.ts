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
  const teamNames = new Set(teams.map((t) => norm(t.name)));

  const teamSlots: MoneylineSlot[] = teams.map((team) => {
    const market = game.moneyline.find((m) => norm(m.group_label) === norm(team.name)) ?? null;
    return { team, market, outcome: market ? yesOutcome(market) : null };
  });

  // The draw market is the moneyline market not matched to a team (label like
  // "Draw (France vs. Senegal)"). Only meaningful for 3-way (football) games.
  const drawMarket = game.moneyline.find((m) => !teamNames.has(norm(m.group_label))) ?? null;
  const drawOutcome = drawMarket ? yesOutcome(drawMarket) : null;
  const draw = drawMarket && drawOutcome ? { market: drawMarket, outcome: drawOutcome } : null;

  return { game, teams, teamSlots, draw };
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
