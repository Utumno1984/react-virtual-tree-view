import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { ContainerGeometry } from "./dnd-internal";

export const DEFAULT_AUTO_SCROLL_THRESHOLD = 40;
export const DEFAULT_AUTO_SCROLL_MAX_SPEED = 20;

/** Ease-in curve on a 0..1 fraction: gentle start, same endpoints as the identity. */
const easeIn = (t: number): number => t * t;

/**
 * Signed scroll speed (px per frame) for a pointer at (`pointerX`, `pointerY`): negative
 * scrolls up, positive scrolls down, 0 outside both bands. Each band is `threshold` px tall
 * and sits just inside the matching edge of `rect`; the speed follows an ease-in (quadratic)
 * curve from 0 at the inner border of the band to `maxSpeed` at the edge (half way into the
 * band it is a quarter of `maxSpeed`), and stays at `maxSpeed` up to
 * `threshold` px past the edge (a drag that overshoots slightly keeps scrolling). Further
 * out, or horizontally outside `rect`, the speed is 0. When the container is so short that
 * the bands overlap, the nearest edge wins. Non-finite inputs give 0.
 */
export function getScrollSpeed(
  pointerX: number,
  pointerY: number,
  rect: { top: number; bottom: number; left: number; right: number },
  threshold: number,
  maxSpeed: number,
): number {
  if (
    !Number.isFinite(threshold) ||
    !Number.isFinite(maxSpeed) ||
    !(threshold > 0) ||
    !(maxSpeed > 0) ||
    !Number.isFinite(pointerX) ||
    !Number.isFinite(pointerY)
  ) {
    return 0;
  }
  if (pointerX < rect.left || pointerX > rect.right) return 0;
  if (pointerY < rect.top - threshold || pointerY > rect.bottom + threshold) return 0;
  const intoTop = Math.min(1, Math.max(0, (rect.top + threshold - pointerY) / threshold));
  const intoBottom = Math.min(1, Math.max(0, (pointerY - (rect.bottom - threshold)) / threshold));
  if (intoTop === 0 && intoBottom === 0) return 0;
  return intoBottom > intoTop ? maxSpeed * easeIn(intoBottom) : -maxSpeed * easeIn(intoTop);
}

export interface UseAutoScrollOptions {
  /** A drag is in progress. */
  active: boolean;
  /** The feature switch (`autoScroll` prop). */
  enabled: boolean;
  containerRef: MutableRefObject<HTMLElement | null>;
  /** Last pointer position in viewport coordinates, kept up to date by the caller. */
  pointerRef: MutableRefObject<{ x: number; y: number }>;
  /**
   * Assigned while the loop runs (and cleared after): returns the cached container geometry,
   * re-reading the rect only if it was invalidated, so the drop resolver shares it.
   */
  geometryRef?: MutableRefObject<(() => ContainerGeometry) | null>;
  threshold: number;
  maxSpeed: number;
  /** Called (at most once per frame) after the container actually scrolled. */
  onScrolled: () => void;
}

/**
 * Scrolls the container while the pointer is in its top/bottom band during a drag. The
 * container rect is read once when the drag starts and again, lazily, only after it was
 * invalidated (window resize, a scroll of the page or an ancestor, a `ResizeObserver` entry
 * for the container) - never per frame or per row. The rAF loop and all listeners/observers
 * are removed when the drag ends and on unmount.
 */
export function useAutoScroll({
  active,
  enabled,
  containerRef,
  pointerRef,
  geometryRef,
  threshold,
  maxSpeed,
  onScrolled,
}: UseAutoScrollOptions): void {
  const onScrolledRef = useRef(onScrolled);
  onScrolledRef.current = onScrolled;

  useEffect(() => {
    if (!active || !enabled) return;
    const el = containerRef.current;
    if (!el) return;
    let rect = el.getBoundingClientRect();
    let dirty = false;
    // `scrollTop` is tracked locally: read once (first use), then kept in sync by our own
    // writes and by `scroll` events, so a tick never reads it before writing.
    let scrollTop = 0;
    let synced = false;
    const sync = () => {
      if (synced) return;
      scrollTop = el.scrollTop;
      synced = true;
    };

    const invalidate = () => {
      dirty = true;
    };
    // Re-reads the rect at most once per invalidation, lazily (so at most once per frame).
    const getGeometry = (): ContainerGeometry => {
      if (dirty) {
        rect = el.getBoundingClientRect();
        dirty = false;
      }
      sync();
      return { rect, scrollTop };
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target === el) {
        // The container itself scrolled (us, the wheel, a scrollbar): its rect is unchanged.
        scrollTop = el.scrollTop;
        synced = true;
      } else if (!(target instanceof Node && el.contains(target))) {
        // The page or an ancestor scrolled: the container moved in the viewport.
        invalidate();
      }
    };
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      let first = true;
      observer = new ResizeObserver(() => {
        // The initial callback on observe() reports the size we just measured.
        if (first) first = false;
        else invalidate();
      });
      observer.observe(el);
    }
    // True while `scrollTop` was just written by the tick (so it is exact). Outside the tick
    // (a pointermove, the drop) an external scroll may not have fired its `scroll` event yet:
    // the resolver then gets a live read instead of a stale value.
    let inTick = false;
    if (geometryRef) {
      geometryRef.current = () => {
        if (!inTick) {
          scrollTop = el.scrollTop;
          synced = true;
        }
        return getGeometry();
      };
    }

    let frame = 0;
    const tick = () => {
      inTick = true;
      const { rect: current } = getGeometry();
      const speed = getScrollSpeed(
        pointerRef.current.x,
        pointerRef.current.y,
        current,
        threshold,
        maxSpeed,
      );
      if (speed !== 0) {
        el.scrollTop = scrollTop + speed;
        // Read back once: the browser clamps to the scrollable range.
        const after = el.scrollTop;
        if (after !== scrollTop) {
          scrollTop = after;
          onScrolledRef.current();
        }
      }
      inTick = false;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", onScroll, { capture: true });
      observer?.disconnect();
      if (geometryRef) geometryRef.current = null;
    };
  }, [active, enabled, containerRef, pointerRef, geometryRef, threshold, maxSpeed]);
}
