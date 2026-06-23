import { useEffect, useState } from 'react';

// A tab change forces a brief skeleton even when TanStack Query serves cached
// data instantly. The max window is the safety net; once the query settles we
// clear shortly after so we never sit on an empty skeleton.
const TAB_TRANSITION_MS = 280;
const SETTLE_DELAY_MS = 80;

/**
 * Forces a brief loading skeleton on every feed tab change.
 *
 * TanStack Query keeps cached data per tab, so switching back to a previously
 * loaded tag is instant — `isLoading` stays false and no skeleton would show.
 * This raises a transition flag whenever `tabKey` changes and clears it either
 * when the underlying query settles (`isFetching` goes false) or after
 * TAB_TRANSITION_MS as a safety net.
 *
 * A single effect drives a single timer. The previous inline version used two
 * effects (a timer and an isFetching watcher) both clearing the same flag, which
 * double-scheduled clears under React Strict Mode's double-invoke; consolidating
 * to one effect removes that race.
 */
export function useFeedTabTransition(tabKey: string, isFetching: boolean): boolean {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [lastTabKey, setLastTabKey] = useState(tabKey);

  // Adjust state during render when the tab changes (React's recommended pattern
  // over a setState-in-effect): flips the skeleton on immediately.
  if (lastTabKey !== tabKey) {
    setLastTabKey(tabKey);
    setIsTransitioning(true);
  }

  useEffect(() => {
    if (!isTransitioning) return;
    // While the query is still fetching, hold the skeleton until the max window;
    // once it settles, clear shortly after. One timer, reset whenever isFetching
    // flips — so a settling query clears the skeleton without racing the cap.
    const delay = isFetching ? TAB_TRANSITION_MS : SETTLE_DELAY_MS;
    const id = window.setTimeout(() => setIsTransitioning(false), delay);
    return () => window.clearTimeout(id);
  }, [isTransitioning, isFetching]);

  return isTransitioning;
}
