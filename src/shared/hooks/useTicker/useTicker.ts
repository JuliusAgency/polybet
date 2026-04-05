import { useEffect, useState } from 'react';

/** Forces a re-render every `intervalMs` milliseconds.
 *  Use in components that display relative time labels ("X seconds ago"). */
export function useTicker(intervalMs: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
