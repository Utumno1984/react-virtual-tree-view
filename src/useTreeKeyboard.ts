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
  if (rows.length > 0) {
    const fromFocus = focusedId === null ? undefined : firstIndexById.get(focusedId);
    focusedIndex = fromFocus ?? (selectedIndex >= 0 ? selectedIndex : 0);
  }

  const tryFocus = useCallback(() => {
    const index = pending.current;
    if (index === null) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-row-index="${index}"]`);
    if (!el) return;
    pending.current = null;
    el.focus({ preventScroll: true });
  }, [containerRef]);

  // After every render: a row that was scrolled into the rendered window can now take focus.
  useEffect(() => {
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

  return { focusedIndex, hasFocus, onRowKeyDown, onRowFocus, onTreeFocus, onTreeBlur };
}
