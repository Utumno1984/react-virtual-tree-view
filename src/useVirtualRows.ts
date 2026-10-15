import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export interface VirtualRange {
  /** Index of the first rendered row (inclusive). */
  start: number;
  /** Index after the last rendered row (exclusive). */
  end: number;
}

// `useLayoutEffect` warns when rendering on the server; the effect only matters in the browser.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Rows to render for a fixed-height list. O(1): the range comes from `scrollTop` and
 * `rowHeight` only, never from measuring rows.
 *
 * With `overscan >= 1` the range never exceeds `ceil(viewportHeight / rowHeight) + 2 * overscan`
 * rows, even when the scroll position is not row-aligned (the partially visible row
 * takes the place of one overscan row). With `overscan = 0` an unaligned scroll
 * needs one extra row to avoid an uncovered strip.
 * A viewport of 0 (not measured yet, e.g. no layout) renders every row; `useVirtualRows`
 * avoids that case when a `ResizeObserver` is available.
 */
export function computeRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan: number,
  count: number,
): VirtualRange {
  if (count <= 0) return { start: 0, end: 0 };
  if (!(viewportHeight > 0) || !(rowHeight > 0)) return { start: 0, end: count };
  const over = Math.max(0, Math.floor(overscan));
  // A stale scrollTop (list shrunk before the browser's scroll event) is clamped.
  const top = Math.min(Math.max(0, scrollTop), Math.max(0, count * rowHeight - viewportHeight));
  const first = Math.floor(top / rowHeight);
  const last = Math.ceil((top + viewportHeight) / rowHeight);
  const start = Math.min(count, Math.max(0, first - over));
  const cap = start + Math.ceil(viewportHeight / rowHeight) + 2 * over;
  const wanted = over >= 1 ? Math.min(last + over, cap) : last;
  const end = Math.min(count, Math.max(start, wanted));
  return { start, end };
}

interface Options {
  count: number;
  rowHeight: number;
  overscan: number;
  /** Fixed viewport height; when omitted it is measured with a ResizeObserver. */
  height: number | undefined;
  containerRef: RefObject<HTMLDivElement | null>;
}

function sameRange(a: VirtualRange, b: VirtualRange): boolean {
  return a.start === b.start && a.end === b.end;
}

export function useVirtualRows({ count, rowHeight, overscan, height, containerRef }: Options) {
  const [scrollTop, setScrollTop] = useState(0);
  const [measured, setMeasured] = useState(0);
  const viewport = height ?? measured;

  const compute = (top: number, view: number): VirtualRange => {
    // Not measured yet: with a ResizeObserver a measurement is on its way, so render a
    // small window instead of every row (10,000 nodes must never be mounted at once).
    if (!(view > 0) && typeof ResizeObserver !== "undefined") {
      const minimal = Math.max(1, 2 * Math.max(0, Math.floor(overscan)));
      return { start: 0, end: Math.min(count, minimal) };
    }
    return computeRange(top, view, rowHeight, overscan, count);
  };
  const range = compute(scrollTop, viewport);

  // Latest values for the scroll handler, which must not change identity on every render.
  const latest = useRef({ compute, range, viewport });
  latest.current = { compute, range, viewport };

  useIsomorphicLayoutEffect(() => {
    if (height !== undefined) return;
    const el = containerRef.current;
    if (!el) return;
    setMeasured(el.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setMeasured(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [height, containerRef]);

  // When what the range depends on changes, re-read the real scroll position (the
  // scroll handler skips updates that would not change the range).
  useIsomorphicLayoutEffect(() => {
    const el = containerRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, [containerRef, count, rowHeight, overscan, viewport]);

  const onScroll = useCallback((event: { currentTarget: { scrollTop: number } }) => {
    const top = event.currentTarget.scrollTop;
    const { compute: current, range: rendered, viewport: view } = latest.current;
    // Re-render only when the visible window actually changes.
    if (!sameRange(current(top, view), rendered)) setScrollTop(top);
  }, []);

  /** Scrolls so that row `index` is fully inside the viewport (no-op if it already is). */
  const scrollToIndex = useCallback(
    (index: number) => {
      const el = containerRef.current;
      if (!el || index < 0 || index >= count) return;
      // clientHeight excludes borders and a horizontal scrollbar; fall back to the
      // known viewport when there is no layout (jsdom).
      const view = el.clientHeight || latest.current.viewport;
      const rowTop = index * rowHeight;
      let next = el.scrollTop;
      if (rowTop < next) next = rowTop;
      else if (rowTop + rowHeight > next + view) next = rowTop + rowHeight - view;
      if (next === el.scrollTop) return;
      el.scrollTop = next;
      setScrollTop(next);
    },
    [containerRef, count, rowHeight],
  );

  return { ...range, viewport, totalHeight: count * rowHeight, onScroll, scrollToIndex };
}
