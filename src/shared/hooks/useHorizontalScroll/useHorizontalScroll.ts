import { useCallback, useRef } from 'react';

// Pointer travel (px) past which a press is treated as a drag rather than a
// click — keeps chip taps working while still allowing grab-and-drag scrolling.
const DRAG_THRESHOLD_PX = 5;

/**
 * Makes a horizontally-scrollable container (overflow-x) usable on desktop with
 * a vertical-only mouse: a vertical wheel is translated into horizontal scroll,
 * and the row can be grabbed and dragged with the mouse. Without this, a
 * single-row chip/tag bar with a hidden scrollbar cannot be scrolled at all by
 * a plain mouse.
 *
 * Returns a callback ref — attach it with `<div ref={useHorizontalScroll()}>`.
 * A callback ref is the deliberate choice over `RefObject` + `useEffect`: the
 * row element is rendered conditionally (the chip data loads async, so the first
 * render returns null before the ref'd div exists). With an effect keyed on the
 * ref object, the listeners would be attached on mount — when the element is
 * still absent — and never re-attach once the data arrives. React invokes a
 * callback ref exactly when the node enters (node) and leaves (null) the DOM, so
 * the listeners bind precisely when the row mounts, regardless of render order.
 *
 * Wheel: the listener is attached natively with `{ passive: false }` because
 * React's synthetic `onWheel` is passive and cannot `preventDefault()`, which is
 * needed to stop the page from scrolling vertically while we move the row.
 * Trackpad horizontal gestures (which already carry deltaX) and rows that do not
 * overflow are left to native behaviour.
 *
 * Drag: mouse-only (touch/trackpad already scroll natively and feel smoother).
 * A press that moves past DRAG_THRESHOLD_PX becomes a drag and the subsequent
 * click is swallowed so the chip under the pointer is not toggled.
 */
export function useHorizontalScroll<T extends HTMLElement = HTMLElement>(): (
  node: T | null,
) => void {
  // Cleanup for the currently-attached node, so we can detach when the node is
  // swapped or unmounted (React calls the callback ref with null on unmount).
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((el: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;

    const canScroll = () => el.scrollWidth > el.clientWidth;

    const onWheel = (event: WheelEvent) => {
      if (!canScroll()) return;
      // Only convert when the user's intent is vertical (a classic mouse wheel);
      // a horizontal trackpad gesture already carries the larger deltaX.
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      // In RTL the row's "end" is on the left and scrollLeft runs into negatives
      // (spec model in modern Chrome/Firefox/Safari), so wheel-down must DECREASE
      // scrollLeft to keep moving toward the end of the row.
      const isRtl = getComputedStyle(el).direction === 'rtl';
      el.scrollLeft += isRtl ? -event.deltaY : event.deltaY;
      event.preventDefault();
    };

    let startX = 0;
    let startScrollLeft = 0;
    let dragging = false;
    let moved = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      if (!canScroll()) return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startScrollLeft = el.scrollLeft;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - startX;
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      if (!moved) {
        moved = true;
        el.setPointerCapture(event.pointerId);
        el.style.cursor = 'grabbing';
        el.style.userSelect = 'none';
      }
      // Direct manipulation: dragging the pointer right reveals content on the
      // left, which is correct in both LTR and RTL.
      el.scrollLeft = startScrollLeft - dx;
      event.preventDefault();
    };

    const endDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
      el.style.cursor = '';
      el.style.userSelect = '';
    };

    // Swallow the click that fires after a real drag so the chip under the
    // pointer is not toggled. `moved` is reset on the next pointerdown.
    const onClickCapture = (event: MouseEvent) => {
      if (moved) {
        event.stopPropagation();
        event.preventDefault();
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('click', onClickCapture, true);

    cleanupRef.current = () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);
}
