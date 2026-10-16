import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

export const DEFAULT_AUTO_SCROLL_THRESHOLD = 40;
export const DEFAULT_AUTO_SCROLL_MAX_SPEED = 20;

/**
 * Signed scroll speed (px per frame) for a pointer at `pointerY`: negative scrolls up,
 * positive scrolls down, 0 outside both bands. Each band is `threshold` px tall and sits just
 * inside the matching edge of `rect`; the speed grows linearly from 0 at the inner border of
 * the band to `maxSpeed` at the edge, and stays at `maxSpeed` past the edge. When the
 * container is so short that the bands overlap, the nearest edge wins.
 */
export function getScrollSpeed(
  pointerY: number,
  rect: { top: number; bottom: number },
  threshold: number,
  maxSpeed: number,
): number {
  if (!(threshold > 0) || !(maxSpeed > 0) || !Number.isFinite(pointerY)) return 0;
  const intoTop = Math.min(1, Math.max(0, (rect.top + threshold - pointerY) / threshold));
  const intoBottom = Math.min(1, Math.max(0, (pointerY - (rect.bottom - threshold)) / threshold));
  if (intoTop === 0 && intoBottom === 0) return 0;
  return intoBottom > intoTop ? maxSpeed * intoBottom : -maxSpeed * intoTop;
}

export interface UseAutoScrollOptions {
  /** A drag is in progress. */
  active: boolean;
  /** The feature switch (`autoScroll` prop). */
  enabled: boolean;
  containerRef: MutableRefObject<HTMLElement | null>;
  /** Last pointer position in viewport coordinates, kept up to date by the caller. */
  pointerRef: MutableRefObject<{ x: number; y: number }>;
  threshold: number;
  maxSpeed: number;
  /** Called (at most once per frame) after the container actually scrolled. */
  onScrolled: () => void;
}

/**
 * Scrolls the container while the pointer is in its top/bottom band during a drag. The
 * container rect is read once when the drag starts (and again on window resize), never per
 * frame or per row; the only per-frame work is reading/writing `scrollTop`. The rAF loop and
 * the resize listener are removed when the drag ends and on unmount.
 */
export function useAutoScroll({
  active,
  enabled,
  containerRef,
  pointerRef,
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
    const onResize = () => {
      rect = el.getBoundingClientRect();
    };
    window.addEventListener("resize", onResize);

    let frame = 0;
    const tick = () => {
      const speed = getScrollSpeed(pointerRef.current.y, rect, threshold, maxSpeed);
      if (speed !== 0) {
        const before = el.scrollTop;
        el.scrollTop = before + speed;
        if (el.scrollTop !== before) onScrolledRef.current();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [active, enabled, containerRef, pointerRef, threshold, maxSpeed]);
}
