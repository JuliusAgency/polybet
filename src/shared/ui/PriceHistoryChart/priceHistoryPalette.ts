// Deterministic palette for outcome lines. Order matches typical Yes/No/first-listed ordering.
// Picked from OKLCH tokens in shared/theme for cohesion with the active surface.
// Recharts paints SVG stroke literals that cannot read CSS vars, so the theme is read
// lazily from the <html> data-theme attribute and the matching literal array is returned.
const OUTCOME_LINE_COLORS: readonly string[] = [
  'oklch(70% 0.15 230)', // accent blue
  'oklch(72% 0.17 150)', // win green
  'oklch(66% 0.2 25)', // loss red
  'oklch(76% 0.16 70)', // pending amber
  'oklch(72% 0.14 290)', // resolved violet
  'oklch(68% 0.14 180)', // teal
  'oklch(72% 0.14 340)', // magenta
  'oklch(74% 0.13 110)', // lime
];

// Light-theme branch — same hues in the SAME order, tuned darker so lines read on a
// white plot background. Index 0 aligns with the retuned light --color-accent.
const OUTCOME_LINE_COLORS_LIGHT: readonly string[] = [
  'oklch(56% 0.19 250)', // accent blue (matches retuned light --color-accent)
  'oklch(50% 0.17 155)', // win green
  'oklch(55% 0.22 28)', // loss red
  'oklch(62% 0.16 70)', // pending amber
  'oklch(52% 0.17 290)', // resolved violet
  'oklch(54% 0.14 180)', // teal
  'oklch(58% 0.16 340)', // magenta
  'oklch(60% 0.14 110)', // lime
];

export function pickOutcomeColor(index: number): string {
  const isLight =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'light';
  const palette = isLight ? OUTCOME_LINE_COLORS_LIGHT : OUTCOME_LINE_COLORS;
  return palette[index % palette.length];
}
