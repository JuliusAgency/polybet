// Static flag set for the World Cup hero wheel. Percentages are intentionally
// hardcoded to a placeholder for now — the real win-probabilities will be wired
// to the (not-yet-synced) "World Cup Winner" event in a separate task. The wheel
// layout / interaction does not depend on the data source, so swapping the
// placeholder for a live hook later is a drop-in change.

export interface WorldCupFlag {
  /** Display name (also used as the React key). */
  country: string;
  /**
   * flag-icons code (ISO 3166-1 alpha-2, lowercase). England uses the GB
   * subdivision subcode `gb-eng`, which flag-icons ships as a regional flag.
   */
  iso2: string;
}

// ~20 favourites — mirrors the nations Polymarket renders on its World Cup hero.
export const WORLD_CUP_FLAGS: readonly WorldCupFlag[] = [
  { country: 'France', iso2: 'fr' },
  { country: 'Spain', iso2: 'es' },
  { country: 'England', iso2: 'gb-eng' },
  { country: 'Argentina', iso2: 'ar' },
  { country: 'Portugal', iso2: 'pt' },
  { country: 'Germany', iso2: 'de' },
  { country: 'Brazil', iso2: 'br' },
  { country: 'Netherlands', iso2: 'nl' },
  { country: 'USA', iso2: 'us' },
  { country: 'Colombia', iso2: 'co' },
  { country: 'Morocco', iso2: 'ma' },
  { country: 'Norway', iso2: 'no' },
  { country: 'Uruguay', iso2: 'uy' },
  { country: 'Senegal', iso2: 'sn' },
  { country: 'Croatia', iso2: 'hr' },
  { country: 'Mexico', iso2: 'mx' },
  { country: 'Belgium', iso2: 'be' },
  { country: 'Japan', iso2: 'jp' },
  { country: 'Switzerland', iso2: 'ch' },
  { country: "Côte d'Ivoire", iso2: 'ci' },
];

/** Placeholder probability shown under every flag before live odds load. */
export const PLACEHOLDER_PERCENT = '50%';

/** Max number of live countries placed on the wheel (top by win probability). */
export const MAX_HERO_FLAGS = 20;

/**
 * Minimum live countries required to render the wheel from real data. Below
 * this the hero falls back to the static roster so a partially-synced event
 * never produces a near-empty wheel.
 */
export const MIN_HERO_FLAGS = 6;

/**
 * Wheel geometry. The circle is large and pushed below the visible band so only
 * the top arc shows through the hero's `overflow: hidden` — matching Polymarket.
 */
export const WHEEL_DIAMETER = 740; // px, square wheel
export const WHEEL_RADIUS = 341; // px, radial offset of each flag from centre
export const FLAG_SIZE = 64; // px, flag card edge
export const PERSPECTIVE = '9000px';

/** Idle auto-rotation speed (≈ one full turn per minute, like Polymarket). */
export const AUTO_SPIN_DEG_PER_SEC = 6;

/** Fraction of the raw drag speed carried into the fling — lower = gentler. */
export const FLING_SCALE = 0.42;

/** Upper bound on the post-release spin speed (deg/sec). */
export const MAX_FLING_DEG_PER_SEC = 260;

/**
 * Inertia after a drag: the fling speed decays back toward the base auto-spin
 * speed, retaining this fraction of the excess each second. Lower = snappier
 * return to the normal idle speed.
 */
export const INERTIA_DECAY_PER_SEC = 0.16;
