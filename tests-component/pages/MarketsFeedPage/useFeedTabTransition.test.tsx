import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFeedTabTransition } from '@/pages/user/MarketsFeedPage/useFeedTabTransition';

// The hook forces a brief skeleton on every feed tab change. These assert the
// single-timer behaviour that replaced the previous racing two-effect version.
describe('useFeedTabTransition', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not transition on first mount', () => {
    const { result } = renderHook(() => useFeedTabTransition('trending|||', false));
    expect(result.current).toBe(false);
  });

  it('raises the flag immediately when the tab key changes', () => {
    const { result, rerender } = renderHook(
      ({ tabKey, isFetching }) => useFeedTabTransition(tabKey, isFetching),
      { initialProps: { tabKey: 'trending|||', isFetching: false } }
    );
    expect(result.current).toBe(false);
    rerender({ tabKey: 'sports|||', isFetching: true });
    expect(result.current).toBe(true);
  });

  it('holds the skeleton until the max window while still fetching', () => {
    const { result, rerender } = renderHook(
      ({ tabKey, isFetching }) => useFeedTabTransition(tabKey, isFetching),
      { initialProps: { tabKey: 'a', isFetching: false } }
    );
    rerender({ tabKey: 'b', isFetching: true });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(279);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it('clears shortly after the query settles, before the max window', () => {
    const { result, rerender } = renderHook(
      ({ tabKey, isFetching }) => useFeedTabTransition(tabKey, isFetching),
      { initialProps: { tabKey: 'a', isFetching: false } }
    );
    rerender({ tabKey: 'b', isFetching: true });
    expect(result.current).toBe(true);

    // Query finishes fetching well before the 280ms cap.
    rerender({ tabKey: 'b', isFetching: false });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(result.current).toBe(false);
  });

  it('stays settled when neither the key nor isFetching changes', () => {
    const { result, rerender } = renderHook(
      ({ tabKey, isFetching }) => useFeedTabTransition(tabKey, isFetching),
      { initialProps: { tabKey: 'a', isFetching: false } }
    );
    rerender({ tabKey: 'a', isFetching: false });
    expect(result.current).toBe(false);
  });
});
