import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query and re-render when it starts/stops matching.
 * Used to switch the BetSlip between a docked sidebar column (desktop) and the
 * floating overlay / bottom-sheet (mobile) with a single component instance.
 *
 * Backed by `useSyncExternalStore` so the subscription is tear-free and never
 * calls setState inside an effect. SSR-safe (returns `false` on the server),
 * though this is a Vite SPA so the first paint already runs in the browser.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
