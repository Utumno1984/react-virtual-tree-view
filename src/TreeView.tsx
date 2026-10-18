import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  FocusEvent,
  ForwardedRef,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  ReactNode,
} from "react";
import {
  collectTermMatches,
  compileSearch,
  hasActiveTerms,
  hasConflictingSearch,
  normalizeQuery,
  searchKey,
} from "./search";
import type { TermMatch } from "./search";
import { normalizePersistableState, sameIdSet } from "./persistable-state";
import { collectIds, findDuplicateIds, flattenTree, getDropTarget } from "./tree-utils";
import type { DropTarget, FlattenedNode, TreeId } from "./tree-utils";
import type { TreeDndAdapter } from "./dnd-internal";
import { createProjectionCache } from "./projection-cache";
import { DropIndicator } from "./DropIndicator";
import { TreeContextMenu } from "./TreeContextMenu";
import type { MenuAnchor, MenuItem, TreeNode } from "./types";
import type { RenderNodeState, SearchResult, TreeViewHandle, TreeViewProps } from "./types";
import { useTreeKeyboard } from "./useTreeKeyboard";
import type { KeyboardRow } from "./useTreeKeyboard";
import { useVirtualRows } from "./useVirtualRows";

const DEFAULT_INDENTATION = 24;
const DEFAULT_ROW_HEIGHT = 32;
const DEFAULT_OVERSCAN = 5;

export function isDevelopment(): boolean {
  // `process.env.NODE_ENV` must stay a literal expression: bundlers (Vite, webpack)
  // replace exactly that text, and `process` itself does not exist in the browser.
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

/** The label with every match wrapped in `<mark data-term-index>`; the plain string when none. */
function highlight(label: string, matches: ReadonlyArray<TermMatch>): ReactNode {
  if (matches.length === 0) return label;
  const parts: ReactNode[] = [];
  let last = 0;
  matches.forEach(({ range: [start, end], termIndex }, i) => {
    const from = Math.max(start, last);
    if (end <= from) return;
    if (from > last) parts.push(label.slice(last, from));
    parts.push(
      <mark key={i} data-term-index={termIndex}>
        {label.slice(from, end)}
      </mark>,
    );
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
    onStateChange,
    initialState,
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
    searchTerms,
    onSearchResult,
    noResults,
    contextMenu,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    dnd,
  }: TreeViewProps<T> & { dnd?: TreeDndAdapter },
  ref: ForwardedRef<TreeViewHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // A non-positive or non-finite rowHeight would stack every row at top:0.
  const rowHeight =
    Number.isFinite(rowHeightProp) && rowHeightProp > 0 ? rowHeightProp : DEFAULT_ROW_HEIGHT;

  // Every id of the whole new tree (not just the visible rows): one O(n) pass per `data`.
  const allIds = useMemo(() => collectIds(data), [data]);

  // `initialState` is read once, on mount: validated, cleaned of ids missing from `data`, and
  // compared with the props that coexist with it (warnings are emitted by an effect below).
  const [mount] = useState(() => {
    if (initialState === undefined) return null;
    const { state, problems } = normalizePersistableState(initialState);
    const notes = [...problems];
    const ignored = [
      defaultExpandedIds !== undefined ? "defaultExpandedIds" : null,
      defaultSelectedId !== undefined ? "defaultSelectedId" : null,
    ].filter((name) => name !== null);
    if (ignored.length > 0) {
      notes.push(`${ignored.join(" and ")} ignored because initialState is set`);
    }
    if (normalizeQuery(state.searchQuery) !== normalizeQuery(searchQuery)) {
      notes.push(
        `initialState.searchQuery (${JSON.stringify(state.searchQuery)}) differs from the ` +
          `searchQuery prop (${JSON.stringify(searchQuery ?? "")}): it is not applied, ` +
          "initialize your search field with the same value",
      );
    }
    return { state, notes };
  });
  const [expanded, setExpanded] = useState<ReadonlySet<TreeId>>(() =>
    mount
      ? new Set(mount.state.expandedIds.filter((id) => allIds.has(id)))
      : new Set(defaultExpandedIds),
  );

  const [uncontrolledSelectedState, setUncontrolledSelectedId] = useState<TreeId | undefined>(() =>
    mount
      ? mount.state.selectedId !== null && allIds.has(mount.state.selectedId)
        ? mount.state.selectedId
        : undefined
      : defaultSelectedId,
  );
  // When `data` is replaced, ids that no longer exist in it are dropped from the internal
  // state (uncontrolled selection, expanded nodes) silently: no `onSelect` and no
  // `onExpandedChange`, since it is a consequence of the new `data`, not a user action.
  // Done during render so a stale selection is never painted. Ids that are only hidden
  // (closed branch, search filter) still exist in `data` and are kept.
  const [reconciledData, setReconciledData] = useState(data);
  // User toggles made while searching (explained below); declared here to be reconciled too.
  const [searchToggles, setSearchToggles] = useState<{
    query: string;
    toggled: ReadonlySet<TreeId>;
  } | null>(null);
  let uncontrolledSelectedId = uncontrolledSelectedState;
  let expandedNow = expanded;
  if (reconciledData !== data) {
    setReconciledData(data);
    if (uncontrolledSelectedId !== undefined && !allIds.has(uncontrolledSelectedId)) {
      uncontrolledSelectedId = undefined;
      setUncontrolledSelectedId(undefined);
    }
    let kept: Set<TreeId> | null = null;
    for (const id of expanded) {
      if (allIds.has(id)) continue;
      kept ??= new Set(expanded);
      kept.delete(id);
    }
    if (kept) {
      expandedNow = kept;
      setExpanded(kept);
    }
    // Same for the user's search toggles: a toggle on a vanished id must not come back
    // if the id returns later.
    if (searchToggles) {
      let keptToggles: Set<TreeId> | null = null;
      for (const id of searchToggles.toggled) {
        if (allIds.has(id)) continue;
        keptToggles ??= new Set(searchToggles.toggled);
        keptToggles.delete(id);
      }
      if (keptToggles) setSearchToggles({ query: searchToggles.query, toggled: keptToggles });
    }
  }
  // `selectedId={undefined}` means uncontrolled; `null` is a controlled "nothing selected".
  const currentSelectedId = selectedId !== undefined ? selectedId : uncontrolledSelectedId;

  // Persistable state: what the consumer last heard of (or, at mount, what it already has:
  // the raw `initialState`, so that a cleanup of vanished ids counts as a change to report).
  const stateQuery = searchQuery ?? "";
  const [baseline] = useState<{
    expanded: ReadonlySet<TreeId>;
    selectedId: TreeId | null;
    searchQuery: string;
  }>(() => ({
    expanded: new Set<TreeId>(mount ? mount.state.expandedIds : expandedNow),
    selectedId:
      selectedId !== undefined
        ? selectedId
        : mount
          ? mount.state.selectedId
          : (currentSelectedId ?? null),
    searchQuery: stateQuery,
  }));
  const lastNotified = useRef(baseline);
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  });
  const notifiedSelectedId = currentSelectedId ?? null;
  useEffect(() => {
    const last = lastNotified.current;
    if (
      sameIdSet(last.expanded, expandedNow) &&
      last.selectedId === notifiedSelectedId &&
      last.searchQuery === stateQuery
    ) {
      return;
    }
    lastNotified.current = {
      expanded: expandedNow,
      selectedId: notifiedSelectedId,
      searchQuery: stateQuery,
    };
    onStateChangeRef.current?.({
      expandedIds: [...expandedNow],
      selectedId: notifiedSelectedId,
      searchQuery: stateQuery,
    });
  }, [expandedNow, notifiedSelectedId, stateQuery]);

  // One development warning per mount (refs survive StrictMode's simulated remount).
  const warnedInitialState = useRef(false);
  useEffect(() => {
    if (!mount || mount.notes.length === 0 || warnedInitialState.current || !isDevelopment())
      return;
    warnedInitialState.current = true;
    console.warn(`[react-virtual-tree-view] initialState: ${mount.notes.join("; ")}.`);
  }, [mount]);

  // One O(n) pass per (data, normalized query): matches, their ancestors and the ids to
  // expand. Keyed on the trimmed query so "foo" -> "foo " does not redo the pass.
  // `searchTerms` may be a new array on every render: the cheap key (O(total term length))
  // decides whether the terms are normalized and the automaton rebuilt.
  const normalizedQuery = searchKey(searchTerms, searchQuery) ?? "";
  const termsMode = hasActiveTerms(searchTerms);
  const compiled = useMemo(
    () => compileSearch(searchTerms, searchQuery),
    // Key + mode are the identity of both inputs.
    [normalizedQuery, termsMode],
  );
  const search = useMemo(
    () => (compiled ? collectTermMatches(data, compiled) : null),
    [data, compiled],
  );
  const warnedBothSearch = useRef(false);
  const bothSearch = hasConflictingSearch(searchTerms, searchQuery);
  useEffect(() => {
    if (!bothSearch || warnedBothSearch.current || !isDevelopment()) return;
    warnedBothSearch.current = true;
    console.warn(
      "[react-virtual-tree-view] searchTerms has active terms and searchQuery is not empty: " +
        "searchQuery is ignored. Pass [...terms, input] to combine them.",
    );
  }, [bothSearch]);
  // Report the result once per change (compared by content, not identity), after commit.
  const onSearchResultRef = useRef(onSearchResult);
  onSearchResultRef.current = onSearchResult;
  const lastReported = useRef(JSON.stringify({ terms: [], matchCount: 0 }));
  useEffect(() => {
    const result: SearchResult = search
      ? {
          terms: search.compiled.inputs.map((input, i) => ({
            term: input.term,
            termIndex: input.termIndex,
            active: input.active,
            matchCount: search.termCounts[i]!,
          })),
          matchCount: search.matches.size,
        }
      : { terms: [], matchCount: 0 };
    const signature = JSON.stringify(result);
    if (signature === lastReported.current) return;
    lastReported.current = signature;
    onSearchResultRef.current?.(result);
  }, [search]);
  // While searching, the user's own expand/collapse is stored as the set of ids they toggled
  // (relative to the auto-expanded ones), tied to the normalized query: it survives a new
  // `data` reference, is dropped when the query really changes, and `expanded` is left
  // untouched, so clearing the query restores it exactly.
  if (searchToggles && searchToggles.query !== normalizedQuery) setSearchToggles(null);
  const effectiveExpanded = useMemo<ReadonlySet<TreeId>>(() => {
    if (!search) return expandedNow;
    if (!searchToggles || searchToggles.query !== search.query) return search.expandedIds;
    const next = new Set(search.expandedIds);
    for (const id of searchToggles.toggled) {
      if (!next.delete(id)) next.add(id);
    }
    return next;
  }, [search, searchToggles, expandedNow]);

  // While a node is dragged its descendants are hidden: lay out as if it were collapsed.
  const activeDragId = dnd?.activeId ?? null;
  const layoutExpanded = useMemo<ReadonlySet<TreeId>>(() => {
    if (activeDragId === null || !effectiveExpanded.has(activeDragId)) return effectiveExpanded;
    const next = new Set(effectiveExpanded);
    next.delete(activeDragId);
    return next;
  }, [effectiveExpanded, activeDragId]);

  const rows = useMemo(() => {
    const flat = flattenTree(data, layoutExpanded, search?.visible);
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
        isExpanded: item.hasChildren && layoutExpanded.has(item.id),
      };
    });
    for (const row of built) row.setSize = childCounts.get(row.parentIndex) ?? 1;
    return built;
  }, [data, layoutExpanded, search]);

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

  // Controlled `selectedId` pointing at an id missing from `data`: the library never changes
  // it, it only warns (development), once per missing id.
  const warnedMissingSelected = useRef<TreeId | null>(null);
  useEffect(() => {
    if (selectedId === undefined || selectedId === null || allIds.has(selectedId)) {
      warnedMissingSelected.current = null;
      return;
    }
    if (!isDevelopment() || warnedMissingSelected.current === selectedId) return;
    warnedMissingSelected.current = selectedId;
    console.warn(
      `[react-virtual-tree-view] The controlled selectedId "${String(selectedId)}" does not exist in \`data\`. ` +
        "The selection is left untouched: update `selectedId` together with `data`.",
    );
  }, [selectedId, allIds]);

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
      if (search) {
        setSearchToggles((prev) => {
          const toggled = new Set(prev && prev.query === search.query ? prev.toggled : []);
          if (!toggled.delete(id)) toggled.add(id);
          return { query: search.query, toggled };
        });
        return;
      }
      const next = new Set(effectiveExpanded);
      if (!next.delete(id)) next.add(id);
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

  // Context menu: the node (by reference, ids may repeat), its entries and where it opens.
  const [menu, setMenu] = useState<{
    node: TreeNode<T>;
    items: MenuItem<T>[];
    anchor: MenuAnchor;
    rowEl: HTMLElement;
    rowIndex: number;
    source: "pointer" | "keyboard";
    key: number;
  } | null>(null);
  const menuCounter = useRef(0);
  const menuItemsFn = contextMenu?.items;
  const openMenu = (
    index: number,
    rowEl: HTMLElement,
    anchor: MenuAnchor,
    source: "pointer" | "keyboard",
  ): boolean => {
    const node = rows[index]?.item.node;
    const items = node && menuItemsFn ? menuItemsFn(node) : [];
    if (!node || items.length === 0) {
      setMenu(null);
      return false;
    }
    setMenu({
      node,
      items,
      anchor,
      rowEl,
      rowIndex: index,
      source,
      key: ++menuCounter.current,
    });
    return true;
  };
  const closeMenu = (restoreFocus: boolean) => {
    const current = menu;
    setMenu(null);
    if (!restoreFocus || !current) return;
    // The row may have been re-created by a re-render: fall back to its index.
    // Only if that index still holds the same node: never move the focus to another one.
    const row = current.rowEl.isConnected
      ? current.rowEl
      : rows[current.rowIndex]?.item.node === current.node
        ? containerRef.current?.querySelector<HTMLElement>(`[data-row-index="${current.rowIndex}"]`)
        : null;
    row?.focus({ preventScroll: true });
  };
  // A drag starting with the menu open closes it (focus stays with the drag).
  const menuOpen = menu !== null;
  useEffect(() => {
    if (menuOpen && activeDragId !== null) setMenu(null);
  }, [menuOpen, activeDragId]);

  const keyboard = useTreeKeyboard({
    rows: keyboardRows,
    firstIndexById,
    selectedIndex,
    knownIds: allIds,
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
  // An empty tree has no roving row (focusedIndex -1): nothing to keep mounted.
  const keepTarget = focusedIndex >= 0 && (anchored || hasFocus);
  const tabbableIndex = focusedInWindow || keepTarget ? focusedIndex : start;
  const renderedIndexes: number[] = [];
  for (let i = start; i < end; i++) renderedIndexes.push(i);
  if (keepTarget && !focusedInWindow) renderedIndexes.push(focusedIndex);
  // The dragged row stays mounted when scrolled out of the window: unmounting it would
  // unregister the draggable in the middle of the drag.
  const activeIndex = activeDragId === null ? -1 : (firstIndexById.get(activeDragId) ?? -1);
  if (activeIndex >= 0 && !renderedIndexes.includes(activeIndex)) renderedIndexes.push(activeIndex);

  // Drop resolution happens once, on release (not on every pointermove): pointer position
  // -> row under it (fixed row height) -> same-parent target.
  const resolverRef = dnd?.resolverRef;
  const maxDepth = dnd?.maxDepth;
  useEffect(() => {
    if (!resolverRef) return;
    // Rebuilt with `rows`, so the cache never outlives the layout it was computed for.
    const cache = createProjectionCache<DropTarget | null, TreeId>();
    let flat: FlattenedNode<T>[] | null = null;
    // Offset of the content's top edge from the container's border-box top, at scrollTop 0
    // (padding/border included); measured again only when the cached container rect changes.
    let measuredRect: object | null = null;
    let contentOffset = 0;
    resolverRef.current = (x, y, activeId, dx, subtreeHeight, geometry) => {
      const el = containerRef.current;
      const content = contentRef.current;
      if (search || !el || !content || rows.length === 0) return null;
      const rect = geometry ? geometry.rect : el.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
      // Rows are positioned inside the content element, which already moves with the
      // scroll and ignores the container's padding/border.
      let top: number;
      if (geometry) {
        if (measuredRect !== rect) {
          measuredRect = rect;
          contentOffset = content.getBoundingClientRect().top - rect.top + el.scrollTop;
        }
        top = rect.top + contentOffset - geometry.scrollTop;
      } else {
        top = content.getBoundingClientRect().top;
      }
      const overIndex = Math.min(rows.length - 1, Math.max(0, Math.floor((y - top) / rowHeight)));
      const steps = Math.round(dx / indentation);
      return cache.get(activeId, overIndex, steps, () => {
        flat ??= rows.map((row) => row.item);
        return getDropTarget(flat, activeId, overIndex, dx, indentation, maxDepth, subtreeHeight);
      });
    };
    return () => {
      resolverRef.current = null;
    };
  }, [resolverRef, rows, rowHeight, search, indentation, maxDepth]);

  const scrollElRef = dnd?.scrollElRef;
  useEffect(() => {
    if (!scrollElRef) return;
    scrollElRef.current = containerRef.current;
    return () => {
      scrollElRef.current = null;
    };
  }, [scrollElRef]);

  const expandRef = dnd?.expandRef;
  useEffect(() => {
    if (!expandRef) return;
    expandRef.current = (id) => {
      if (effectiveExpanded.has(id)) return;
      const next = new Set(effectiveExpanded);
      next.add(id);
      setExpanded(next);
      onExpandedChange?.([...next]);
    };
    return () => {
      expandRef.current = null;
    };
  }, [expandRef, effectiveExpanded, onExpandedChange]);

  const renderBody = (index: number, state: RenderNodeState, interactive: boolean) => {
    const { item } = rows[index]!;
    const { node, hasChildren } = item;
    return (
      <>
        <span
          data-toggle=""
          aria-hidden="true"
          onClick={
            interactive && hasChildren
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
          {hasChildren ? (renderIcon ? renderIcon(state) : state.isExpanded ? "▾" : "▸") : null}
        </span>
        {renderNode ? renderNode(node, state) : highlight(node.label, state.termMatches)}
      </>
    );
  };

  const buildState = (index: number): RenderNodeState => {
    const { item, isExpanded } = rows[index]!;
    const { node, depth, hasChildren } = item;
    const isMatch = !!search && search.matches.has(node);
    const termMatches = (isMatch && search?.termMatches.get(node)) || [];
    return {
      depth,
      isExpanded,
      isDisabled: !!node.isDisabled,
      hasChildren,
      isSelected: index === selectedIndex,
      isFocused: hasFocus && index === focusedIndex,
      isSearching: !!search,
      isMatch,
      matchRanges: termMatches.map((m) => m.range),
      termMatches,
    };
  };
  const classFor = (state: RenderNodeState) =>
    typeof rowClassName === "function" ? rowClassName(state) : rowClassName;

  // The overlay repeats the dragged row's content; it is decorative (the row itself stays
  // in the tree), so it is hidden from assistive tech and carries no treeitem role.
  const overlay =
    dnd && activeIndex >= 0
      ? (() => {
          const state = buildState(activeIndex);
          return (
            <div
              aria-hidden="true"
              data-drag-overlay=""
              className={classFor(state)}
              style={{
                height: rowHeight,
                boxSizing: "border-box",
                paddingLeft: state.depth * indentation,
                pointerEvents: "none",
              }}
            >
              {renderBody(activeIndex, state, false)}
            </div>
          );
        })()
      : null;

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
          rows.length === 0 ? undefined : { overflow: "auto", height, boxSizing: "border-box" }
        }
      >
        <div ref={contentRef} role="none" style={{ position: "relative", height: totalHeight }}>
          {renderedIndexes.map((index) => {
            const { item, key, setSize, posInSet } = rows[index]!;
            const { node, depth, hasChildren } = item;
            const state = buildState(index);
            const rowProps = {
              role: "treeitem",
              className: classFor(state),
              "data-node-id": String(node.id),
              "data-row-index": index,
              tabIndex: index === tabbableIndex ? 0 : -1,
              onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                if (
                  contextMenu &&
                  event.target === event.currentTarget &&
                  ((event.key === "F10" && event.shiftKey && !event.ctrlKey && !event.altKey) ||
                    event.key === "ContextMenu")
                ) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const opened = openMenu(
                    index,
                    event.currentTarget,
                    { x: rect.left, y: rect.bottom, altY: rect.top },
                    "keyboard",
                  );
                  // Nothing to show: leave the native menu alone.
                  if (opened) event.preventDefault();
                  return;
                }
                keyboard.onRowKeyDown(event, index);
              },
              onContextMenu: contextMenu
                ? (event: MouseEvent<HTMLDivElement>) => {
                    // The key already opened the menu; the browser may add its own contextmenu event.
                    if (
                      menu?.source === "keyboard" &&
                      menu.rowEl === event.currentTarget &&
                      event.button === 0
                    ) {
                      event.preventDefault();
                      return;
                    }
                    const opened = openMenu(
                      index,
                      event.currentTarget,
                      { x: event.clientX, y: event.clientY },
                      "pointer",
                    );
                    if (opened) event.preventDefault();
                  }
                : undefined,
              onFocus: (event: FocusEvent<HTMLDivElement>) => keyboard.onRowFocus(event, index),
              onClick: () => select(index),
              "data-disabled": state.isDisabled ? "" : undefined,
              "aria-level": depth + 1,
              "aria-setsize": setSize,
              "aria-posinset": posInSet,
              "aria-haspopup": contextMenu ? ("menu" as const) : undefined,
              "aria-expanded": hasChildren ? state.isExpanded : undefined,
              "aria-selected": state.isSelected,
              "aria-disabled": state.isDisabled ? true : undefined,
              style: {
                position: "absolute",
                top: item.index * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
                boxSizing: "border-box",
                paddingLeft: depth * indentation,
              } as const,
            };
            const body = renderBody(index, state, true);
            if (!dnd) {
              return (
                <div key={key} {...rowProps}>
                  {body}
                </div>
              );
            }
            return (
              <dnd.RowShell
                key={key}
                nodeId={node.id}
                dragDisabled={state.isDisabled || !!search}
                {...rowProps}
              >
                {body}
              </dnd.RowShell>
            );
          })}
          {dnd && (
            <DropIndicator
              store={dnd.previewStore}
              rowHeight={rowHeight}
              indentation={indentation}
              render={dnd.renderDropIndicator}
            />
          )}
        </div>
      </div>
      {menu && contextMenu && (
        <TreeContextMenu
          key={menu.key}
          node={menu.node}
          items={menu.items}
          anchor={menu.anchor}
          onClose={closeMenu}
          className={contextMenu.className}
          itemClassName={contextMenu.itemClassName}
          renderItem={contextMenu.renderItem}
          aria-label={contextMenu["aria-label"]}
        />
      )}
      {/* Always mounted (even with no content) so DragOverlay can run its drop animation. */}
      {dnd?.renderOverlay(overlay)}
      {rows.length === 0 && (search ? noResults : emptyState)}
    </>
  );
}

const ForwardedTreeView = forwardRef(TreeViewInner);
ForwardedTreeView.displayName = "TreeView";

/** Internal: `TreeView` plus the `dnd` seam used by `DraggableTreeView`. Not exported publicly. */
export const TreeViewWithDnd = ForwardedTreeView as <T = unknown>(
  props: TreeViewProps<T> & { dnd?: TreeDndAdapter } & {
    ref?: ForwardedRef<TreeViewHandle>;
  },
) => ReactElement | null;

export const TreeView = ForwardedTreeView as <T = unknown>(
  props: TreeViewProps<T> & { ref?: ForwardedRef<TreeViewHandle> },
) => ReactElement | null;
