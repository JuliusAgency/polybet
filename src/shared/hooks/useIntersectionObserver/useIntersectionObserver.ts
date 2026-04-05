import { type RefObject, useEffect } from 'react';

interface Options {
  rootMargin?: string;
  threshold?: number;
}

export function useIntersectionObserver(
  ref: RefObject<HTMLElement | null>,
  callback: () => void,
  enabled: boolean,
  options: Options = {}
): void {
  useEffect(() => {
    if (!enabled || !ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          callback();
        }
      },
      { rootMargin: options.rootMargin ?? '200px', threshold: options.threshold ?? 0 }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [enabled, callback, options.rootMargin, options.threshold, ref]);
}
