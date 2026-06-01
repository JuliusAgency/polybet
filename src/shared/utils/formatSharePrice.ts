/**
 * Formats a 0..1 share price as Polymarket-style cents.
 *
 * Each outcome share pays $1 on resolution, so its price in (0,1) maps
 * directly to a cents value: 0.71 → "71¢", 0.30 → "30¢", 0.083 → "8.3¢".
 *
 * Edge handling:
 *   - non-finite (NaN, Infinity) → "–"
 *   - clamps to [0, 1] before formatting
 *   - whole-cent values drop the ".0" so 0.71 renders "71¢" not "71.0¢";
 *     sub-cent / fractional values keep one decimal ("8.3¢", "0.5¢").
 */
export function formatSharePrice(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return '–';

  const clamped = Math.max(0, Math.min(1, price));
  const cents = clamped * 100;
  const rounded = cents.toFixed(1).replace(/\.0$/, '');
  return `${rounded}¢`;
}
