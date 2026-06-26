import { useCallback, useState } from 'react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

/** md breakpoint — at and above this the chart is always shown. */
const DESKTOP_QUERY = '(min-width: 768px)';

export interface PriceHistoryCollapse {
  /** Whether the chart (and its market badges) should render. */
  open: boolean;
  /** Reveal the chart (called when a timeframe chip is tapped on mobile). */
  expand: () => void;
  /** Toggle the chart open/closed on mobile (the header chevron). */
  toggle: () => void;
}

/**
 * On phones the price-history chart is collapsed by default — it otherwise
 * dominates the first screen of the bet page (Polymarket keeps it compact too).
 * Only the timeframe chips show until the user taps a range (or the chevron),
 * which opens the chart. From md up the chart is always shown.
 *
 * The caller should also gate its price-history fetch on `open` so no data is
 * loaded until the chart is actually revealed.
 */
export function usePriceHistoryCollapse(): PriceHistoryCollapse {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [openedOnMobile, setOpenedOnMobile] = useState(false);

  const open = isDesktop || openedOnMobile;
  const expand = useCallback(() => setOpenedOnMobile(true), []);
  const toggle = useCallback(() => setOpenedOnMobile((v) => !v), []);

  return { open, expand, toggle };
}
