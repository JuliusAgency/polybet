/**
 * Viewport at/above which the BetSlip renders as an in-flow sticky sidebar
 * column (Polymarket-style). Below it the slip falls back to the floating
 * overlay / bottom-sheet so the trade panel never crowds a narrow layout.
 * Matches Tailwind's `lg` breakpoint.
 */
export const BETSLIP_DOCK_QUERY = '(min-width: 1024px)';
