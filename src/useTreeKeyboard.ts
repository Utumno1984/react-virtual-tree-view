import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { TreeId } from "./tree-utils";

/** The part of a visible row the keyboard logic needs. */
export interface KeyboardRow {
  id: TreeId;
  isDisabled: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  /** Index (in the visible rows) of the parent row, or -1 for a root. */
  parentIndex: number;
}

interface Options {
  rows: ReadonlyArray<KeyboardRow>;
  /** First visible row of each id (the first occurrence wins when ids repeat). */
  firstIndexById: ReadonlyMap<TreeId, number>;
  selectedIndex: number;
  containerRef: RefObject<HTMLElement | null>;
  scrollToIndex: (index: number) => void;
  toggle: (id: TreeId) => void;
  select: (index: number) => void;
}

/**
 * WAI-ARIA tree keyboard navigation with a roving tabindex. The focused row is tracked
 * by id, so it survives expanding, collapsing and virtualization.
 */
export function useTreeKeyboard({
  rows,
  firstIndexById,
  selectedIndex,
  containerRef,
  scrollToIndex,
  toggle,
  select,
}: Options) {
  const [focusedId, setFocusedId] = useState<TreeId | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const pending = useRef<number | null>(null);

  // Row that holds the roving tabindex: the focused one, else the selected one, else the
  // first. A focused/selected id that is not visible (collapsed branch, unknown id) falls
  // through to the next candidate.
  let focusedIndex = -1;
  // True when the roving row was chosen (focused or selected) rather than defaulted to the
  // first row: only then is it worth keeping that row mounted outside the window.
  let anchored = false;
  if (rows.length > 0) {
    const fromFocus = focusedId === null ? undefined : firstIndexById.get(focusedId);
    anchored = fromFocus !== undefined || selectedIndex >= 0;
    focusedIndex = fromFocus ?? (selectedIndex >= 0 ? selectedIndex : 0);
  }

  const tryFocus = useCallback(() => {
    const index = pending.current;
    if (index === null) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-row-index="${index}"]`);
    if (!el) return;
    pending.current = null;
    el.focus({ preventScroll: true });
    // The tree may have no scroll of its own (no `height`, sized by content): then the page
    // must scroll, and `preventDefault` on the arrow keys stops the browser doing it.
    el.scrollIntoView?.({ block: "nearest" });
  }, [containerRef]);

  // After every render: a row that was scrolled into the rendered window can now take focus.
  // If the tree believes it has focus but the focused row was unmounted (React fires no
  // blur for that), focus returns to the roving row instead of leaving a ghost focus ring.
  useEffect(() => {
    const container = containerRef.current;
    if (hasFocus && container && focusedIndex >= 0 && !container.contains(document.activeElement)) {
      const active = document.activeElement;
      if (active === null || active === document.body) {
        pending.current = focusedIndex;
      } else {
        // Focus legitimately moved elsewhere (e.g. an external input): never steal it back.
        pending.current = null;
        setHasFocus(false);
      }
    }
    tryFocus();
  });

  const focusIndex = (index: number) => {
    const row = rows[index];
    if (!row) return;
    setFocusedId(row.id);
    pending.current = index;
    scrollToIndex(index);
    tryFocus();
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    // Ignore keys coming from interactive content rendered inside the row.
    if (event.target !== event.currentTarget) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const row = rows[index];
    if (!row) return;
    let handled = true;
    switch (event.key) {
      case "ArrowDown":
        if (index < rows.length - 1) focusIndex(index + 1);
        break;
      case "ArrowUp":
        if (index > 0) focusIndex(index - 1);
        break;
      case "ArrowRight":
        if (row.hasChildren && !row.isExpanded) toggle(row.id);
        else if (row.hasChildren && row.isExpanded) focusIndex(index + 1);
        break;
      case "ArrowLeft":
        if (row.hasChildren && row.isExpanded) toggle(row.id);
        else if (row.parentIndex >= 0) focusIndex(row.parentIndex);
        break;
      case "Home":
        focusIndex(0);
        break;
      case "End":
        focusIndex(rows.length - 1);
        break;
      case "Enter":
      case " ":
        select(index);
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
  };

  const onRowFocus = (event: { target: unknown; currentTarget: unknown }, index: number) => {
    if (event.target !== event.currentTarget) return;
    const row = rows[index];
    if (row) setFocusedId(row.id);
  };

  const onTreeFocus = () => setHasFocus(true);
  const onTreeBlur = (event: { relatedTarget: EventTarget | null }) => {
    const container = containerRef.current;
    if (container && event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) {
      return;
    }
    setHasFocus(false);
  };

  return { focusedIndex, anchored, hasFocus, onRowKeyDown, onRowFocus, onTreeFocus, onTreeBlur };
}
