import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ForwardedRef, ReactElement, ReactNode } from "react";
import { collectMatches, getMatchRanges } from "./search";
import type { SearchResult } from "./search";
import { findDuplicateIds, flattenTree } from "./tree-utils";
import type { TreeId } from "./tree-utils";
import type { RenderNodeState, TreeViewHandle, TreeViewProps } from "./types";
import { useTreeKeyboard } from "./useTreeKeyboard";
import type { KeyboardRow } from "./useTreeKeyboard";
import { useVirtualRows } from "./useVirtualRows";

const DEFAULT_INDENTATION = 24;
const DEFAULT_ROW_HEIGHT = 32;
const DEFAULT_OVERSCAN = 5;

function isDevelopment(): boolean {
  // `process.env.NODE_ENV` must stay a literal expression: bundlers (Vite, webpack)
  // replace exactly that text, and `process` itself does not exist in the browser.
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

/** The label with every range wrapped in `<mark>`; the plain string when there is none. */
function highlight(label: string, ranges: Array<[number, number]>): ReactNode {
  if (ranges.length === 0) return label;
  const parts: ReactNode[] = [];
  let last = 0;
  ranges.forEach(([start, end], i) => {
    if (start > last) parts.push(label.slice(last, start));
    parts.push(<mark key={i}>{label.slice(start, end)}</mark>);
    last = end;
  });
  if (last < label.length) parts.push(label.slice(last));
  return parts;
}

function TreeViewInner<T = unknown>(
  {
  data,
  defaultExpandedIds,
  onExpandedChange,
  selectedId,
  defaultSelectedId,
  onSelect,
  indentation = DEFAULT_INDENTATION,
  rowHeight: rowHeightProp = DEFAULT_ROW_HEIGHT,
  height,
  overscan = DEFAULT_OVERSCAN,
  renderNode,
  renderIcon,
  className,
  rowClassName,
  emptyState,
  searchQuery,
  noResults,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: TreeViewProps<T>,
  ref: ForwardedRef<TreeViewHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  // A non-positive or non-finite rowHeight would stack every row at top:0.
  const rowHeight =
    Number.isFinite(rowHeightProp) && rowHeightProp > 0 ? rowHeightProp : DEFAULT_ROW_HEIGHT;
  const [expanded, setExpanded] = useState<ReadonlySet<TreeId>>(
    () => new Set(defaultExpandedIds),
  );

  const [uncontrolledSelectedId, setUncontrolledSelectedId] = useState<TreeId | undefined>(
    defaultSelectedId,
  );
  // `selectedId={undefined}` means uncontrolled; `null` is a controlled "nothing selected".
  const currentSelectedId = selectedId !== undefined ? selectedId : uncontrolledSelectedId;

  // One O(n) pass per (data, query): matches, their ancestors and the ids to expand.
  const search = useMemo(() => collectMatches(data, searchQuery), [data, searchQuery]);
  // While searching, the user's own expand/collapse lives in `searchExpanded` (tied to the
  // current `search` result, so it is dropped when the query or data change) and `expanded`
  // is left untouched: clearing the query restores it exactly.
  const [searchOverride, setSearchOverride] = useState<{
    for: SearchResult<T>;
    ids: ReadonlySet<TreeId>;
  } | null>(null);
  const effectiveExpanded: ReadonlySet<TreeId> = search
    ? searchOverride && searchOverride.for === search
      ? searchOverride.ids
      : search.expandedIds
    : expanded;

  const rows = useMemo(() => {
    const flat = flattenTree(data, effectiveExpanded, search?.visible);
    // aria-setsize / aria-posinset in one pass: `counters[d]` is the number of siblings
    // seen at depth d of the current path; the sizes are filled once the pass is over.
    const counters: number[] = [];
    const parentIndexes: number[] = [];
    const childCounts = new Map<number, number>();
    const seen = new Set<TreeId>();
    const built = flat.map((item) => {
      const { depth } = item;
      counters.length = depth + 1;
      counters[depth] = (counters[depth] ?? 0) + 1;
      parentIndexes.length = depth + 1;
      const parentIndex = depth === 0 ? -1 : (parentIndexes[depth - 1] ?? -1);
      parentIndexes[depth] = item.index;
      childCounts.set(parentIndex, (childCounts.get(parentIndex) ?? 0) + 1);
      const setSize = 0;
      // Keys are prefixed by id type (so 1 and "1" differ); rows with a repeated id
      // get a "d:<row index>" key, a prefix no regular key can have.
      const key = seen.has(item.id)
        ? `d:${item.index}`
        : `${typeof item.id === "number" ? "n" : "s"}:${String(item.id)}`;
      seen.add(item.id);
      return {
        item,
        key,
        setSize,
        posInSet: counters[depth],
        parentIndex,
        isExpanded: item.hasChildren && effectiveExpanded.has(item.id),
      };
    });
    for (const row of built) row.setSize = childCounts.get(row.parentIndex) ?? 1;
    return built;
  }, [data, effectiveExpanded, search]);

  // First visible row of each id: with duplicate ids the first occurrence wins.
  const firstIndexById = useMemo(() => {
    const map = new Map<TreeId, number>();
    rows.forEach((row, index) => {
      if (!map.has(row.item.id)) map.set(row.item.id, index);
    });
    return map;
  }, [rows]);
  const selectedIndex =
    currentSelectedId === undefined || currentSelectedId === null
      ? -1
      : (firstIndexById.get(currentSelectedId) ?? -1);
  const keyboardRows = useMemo<KeyboardRow[]>(
    () =>
      rows.map((row) => ({
        id: row.item.id,
        isDisabled: !!row.item.node.isDisabled,
        hasChildren: row.item.hasChildren,
        isExpanded: row.isExpanded,
        parentIndex: row.parentIndex,
      })),
    [rows],
  );

  const { start, end, viewport, totalHeight, onScroll, scrollToIndex } = useVirtualRows({
    count: rows.length,
    rowHeight,
    overscan,
    height,
    containerRef,
  });

  useImperativeHandle(
    ref,
    () => ({
      scrollToId(id) {
        const index = rows.findIndex((row) => row.item.id === id);
        if (index >= 0) scrollToIndex(index);
      },
    }),
    [rows, scrollToIndex],
  );

  useEffect(() => {
    if (!isDevelopment() || rowHeight === rowHeightProp) return;
    console.warn(
      `[react-virtual-tree-view] Invalid rowHeight (${String(rowHeightProp)}): ` +
        `it must be a positive number. Using ${DEFAULT_ROW_HEIGHT}.`,
    );
  }, [rowHeight, rowHeightProp]);

  const warnedNoHeight = useRef(false);
  useEffect(() => {
    // Without `height` the container must be sized by the consumer's CSS; if it just
    // grows to fit all rows, nothing is virtualized.
    if (!isDevelopment() || warnedNoHeight.current) return;
    if (height === undefined && rows.length > 200 && viewport >= rows.length * rowHeight) {
      warnedNoHeight.current = true;
      console.warn(
        "[react-virtual-tree-view] The tree is as tall as all its rows, so rows are not " +
          "virtualized. Pass the `height` prop or give the tree a bounded height via CSS.",
      );
    }
  }, [height, rows.length, rowHeight, viewport]);

  const warnedDuplicates = useRef("");

  useEffect(() => {
    if (!isDevelopment()) return;
    const duplicates = findDuplicateIds(data);
    // Refs survive StrictMode's simulated unmount/remount, so the same set of
    // duplicates is reported once, not once per effect run or per new `data` identity.
    const signature = duplicates.map(String).join("\u0000");
    if (signature === warnedDuplicates.current) return;
    warnedDuplicates.current = signature;
    if (duplicates.length > 0) {
      console.warn(
        `[react-virtual-tree-view] Duplicate node ids found: ${duplicates.map(String).join(", ")}. ` +
          "Ids must be unique.",
      );
    }
  }, [data]);

  const toggle = useCallback(
    (id: TreeId) => {
      const next = new Set(effectiveExpanded);
      if (!next.delete(id)) next.add(id);
      if (search) {
        setSearchOverride({ for: search, ids: next });
        return;
      }
      setExpanded(next);
      onExpandedChange?.([...next]);
    },
    [effectiveExpanded, search, onExpandedChange],
  );

  const select = (index: number) => {
    const row = rows[index];
    if (!row || row.item.node.isDisabled) return;
    if (selectedId === undefined) setUncontrolledSelectedId(row.item.id);
    onSelect?.(row.item.id, row.item.node);
  };

  const keyboard = useTreeKeyboard({
    rows: keyboardRows,
    firstIndexById,
    selectedIndex,
    containerRef,
    scrollToIndex,
    toggle,
    select,
  });

  // The roving tabindex row must exist in the DOM, or Tab could not enter the tree on the
  // right row. A focused or selected row is always rendered (positioned with `top`), even
  // when scrolled out of the window. With neither, the default is the first row; if that is
  // out of the window too, the first rendered row takes the tabindex instead.
  const { focusedIndex, anchored, hasFocus } = keyboard;
  const focusedInWindow = focusedIndex >= start && focusedIndex < end;
  const keepTarget = anchored || hasFocus;
  const tabbableIndex = focusedInWindow || keepTarget ? focusedIndex : start;
  const renderedIndexes: number[] = [];
  for (let i = start; i < end; i++) renderedIndexes.push(i);
  if (keepTarget && !focusedInWindow) renderedIndexes.push(focusedIndex);

  // Ids in `expandedIds` that no longer exist in `data` are ignored but kept in the set.
  return (
    <>
      <div
        ref={containerRef}
        role="tree"
        className={className}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onScroll={onScroll}
        onFocus={keyboard.onTreeFocus}
        onBlur={keyboard.onTreeBlur}
        // `height` is set only when the prop is given, so the consumer's CSS can size the
        // tree; an empty tree gets no height/overflow so `emptyState` sits right below it.
        style={
          rows.length === 0
            ? undefined
            : { overflow: "auto", height, boxSizing: "border-box" }
        }
      >
        <div role="none" style={{ position: "relative", height: totalHeight }}>
        {renderedIndexes.map((index) => {
          const { item, key, setSize, posInSet, isExpanded } = rows[index]!;
          const { node, depth, hasChildren } = item;
          const isDisabled = !!node.isDisabled;
          const isMatch = !!search && search.matches.has(node);
          const matchRanges = isMatch && search ? getMatchRanges(node.label, search.query) : [];
          const state: RenderNodeState = {
            depth,
            isExpanded,
            isDisabled,
            hasChildren,
            isSelected: index === selectedIndex,
            isFocused: hasFocus && index === focusedIndex,
            isSearching: !!search,
            isMatch,
            matchRanges,
          };
          const rowClass =
            typeof rowClassName === "function"
              ? rowClassName(state)
              : rowClassName;
          return (
            <div
              key={key}
              role="treeitem"
              className={rowClass}
              data-node-id={String(node.id)}
              data-row-index={index}
              tabIndex={index === tabbableIndex ? 0 : -1}
              onKeyDown={(event) => keyboard.onRowKeyDown(event, index)}
              onFocus={(event) => keyboard.onRowFocus(event, index)}
              onClick={() => select(index)}
              data-disabled={isDisabled ? "" : undefined}
              aria-level={depth + 1}
              aria-setsize={setSize}
              aria-posinset={posInSet}
              aria-expanded={hasChildren ? isExpanded : undefined}
              aria-selected={state.isSelected}
              aria-disabled={isDisabled ? true : undefined}
              style={{
                position: "absolute",
                top: item.index * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
                boxSizing: "border-box",
                paddingLeft: depth * indentation,
              }}
            >
              <span
                data-toggle=""
                aria-hidden="true"
                onClick={
                  hasChildren
                    ? (event) => {
                        // Expanding must not also select the row.
                        event.stopPropagation();
                        toggle(node.id);
                      }
                    : undefined
                }
                style={{
                  display: "inline-block",
                  minWidth: "1em",
                  cursor: hasChildren ? "pointer" : undefined,
                }}
              >
                {hasChildren
                  ? renderIcon
                    ? renderIcon(state)
                    : isExpanded
                      ? "▾"
                      : "▸"
                  : null}
              </span>
              {renderNode ? renderNode(node, state) : highlight(node.label, matchRanges)}
            </div>
          );
        })}
        </div>
      </div>
      {rows.length === 0 && (search ? noResults : emptyState)}
    </>
  );
}

const ForwardedTreeView = forwardRef(TreeViewInner);
ForwardedTreeView.displayName = "TreeView";

export const TreeView = ForwardedTreeView as <T = unknown>(
  props: TreeViewProps<T> & { ref?: ForwardedRef<TreeViewHandle> },
) => ReactElement | null;
