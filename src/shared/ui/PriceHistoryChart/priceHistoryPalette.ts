// Deterministic palette for outcome lines. Order matches typical Yes/No/first-listed ordering.
// Picked from OKLCH tokens in shared/theme for cohesion with the dark surface.
export const OUTCOME_LINE_COLORS: readonly string[] = [
  'oklch(70% 0.15 230)', // accent blue
  'oklch(72% 0.17 150)', // win green
  'oklch(66% 0.2 25)', // loss red
  'oklch(76% 0.16 70)', // pending amber
  'oklch(72% 0.14 290)', // resolved violet
  'oklch(68% 0.14 180)', // teal
  'oklch(72% 0.14 340)', // magenta
  'oklch(74% 0.13 110)', // lime
];

export function pickOutcomeColor(index: number): string {
  return OUTCOME_LINE_COLORS[index % OUTCOME_LINE_COLORS.length];
}
