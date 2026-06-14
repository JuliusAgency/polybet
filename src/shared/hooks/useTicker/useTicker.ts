import { useEffect, useState } from 'react';

/** Re-renders every `intervalMs` milliseconds and returns the timestamp of the
 *  latest tick. Use in components that display relative time labels
 *  ("X seconds ago") — read the returned value instead of calling `Date.now()`
 *  during render (which is impure). */
export function useTicker(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
