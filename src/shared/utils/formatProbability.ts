/**
 * Formats a 0..1 probability as a human-readable percentage with one
 * decimal place by default.
 *
 * Edge handling:
 *   - non-finite (NaN, Infinity)     → "–"
 *   - exactly 0 or 1                 → "0%" / "100%"
 *   - 0 < value < 0.005              → "<1%"   (avoid misleading "0%")
 *   - 0.995 < value < 1              → ">99%"  (avoid misleading "100%")
 *   - trailing ".0" is stripped so 50% renders as "50%" not "50.0%"
 *
 * Returns the value clamped to [0, 1] before formatting.
 */
export function formatProbability(value: number | null | undefined, fractionDigits = 1): string {
  if (value == null || !Number.isFinite(value)) return '–';

  const clamped = Math.max(0, Math.min(1, value));
  const pct = clamped * 100;

  if (clamped === 0) return '0%';
  if (clamped === 1) return '100%';
  if (pct < 0.5) return '<1%';
  if (pct > 99.5) return '>99%';

  const rounded = pct.toFixed(fractionDigits).replace(/\.0+$/, '');
  return `${rounded}%`;
}
