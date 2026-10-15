import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export interface VirtualRange {
  /** Index of the first rendered row (inclusive). */
  start: number;
  /** Index after the last rendered row (exclusive). */
  end: number;
}

/**
 * Rows to render for a fixed-height list. O(1): the range comes from `scrollTop` and
 * `rowHeight` only, never from measuring rows.
 * A viewport of 0 (not measured yet, e.g. no layout) renders every row.
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
  const end = Math.min(count, Math.max(start, last + over));
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

export function useVirtualRows({ count, rowHeight, overscan, height, containerRef }: Options) {
  const [scrollTop, setScrollTop] = useState(0);
  const [measured, setMeasured] = useState(0);
  const viewport = height ?? measured;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useEffect(() => {
    if (height !== undefined) return;
    const el = containerRef.current;
    if (!el) return;
    setMeasured(el.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setMeasured(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [height, containerRef]);

  const onScroll = useCallback(
    (event: { currentTarget: { scrollTop: number } }) => {
      setScrollTop(event.currentTarget.scrollTop);
    },
    [],
  );

  /** Scrolls so that row `index` is fully inside the viewport (no-op if it already is). */
  const scrollToIndex = useCallback(
    (index: number) => {
      const el = containerRef.current;
      if (!el || index < 0 || index >= count) return;
      const view = viewportRef.current || el.clientHeight;
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

  const range = computeRange(scrollTop, viewport, rowHeight, overscan, count);
  return { ...range, totalHeight: count * rowHeight, onScroll, scrollToIndex };
}
