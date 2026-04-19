/**
 * Compact currency volume formatting (Polymarket-style): 17_000_000 → "$17M".
 */
export function formatVolume(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;

  const formatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  return `$${formatter.format(value)}`;
}
