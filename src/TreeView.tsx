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
import {
  collectIds,
  findFirstNode,
  findDuplicateIds,
  flattenTree,
  getCheckStates,
  getDragPaddingRows,
  getDropTarget,
  getEndDropTarget,
  getDropZone,
  toggleChecked,
  withoutDerived,
} from "./tree-utils";
import type { DropTarget, DropZone, FlattenedNode, TreeId } from "./tree-utils";
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
    checkable = false,
    checkedIds: checkedIdsProp,
    defaultCheckedIds,
    onCheckedChange,
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
  // Uncontrolled checked ids (only meaningful with `checkable`); ids missing from `data` are
  // never kept.
  const [uncontrolledChecked, setUncontrolledChecked] = useState<ReadonlySet<TreeId>>(
    () => {
      const ids = new Set((defaultCheckedIds ?? []).filter((id) => allIds.has(id)));
      // Parents are derived from their children: their own id is never stored.
      return checkable ? withoutDerived(data, ids) : ids;
    },
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
    termsMode: boolean;
    toggled: ReadonlySet<TreeId>;
  } | null>(null);
  let uncontrolledSelectedId = uncontrolledSelectedState;
  let expandedNow = expanded;
  let uncontrolledCheckedNow = uncontrolledChecked;
  if (reconciledData !== data) {
    setReconciledData(data);
    // Only vanished ids are dropped silently (no `onCheckedChange`). An id that became derived
    // (now a parent) stays in memory: `getCheckStates` ignores it, and it is cleared by the
    // next user action (which is notified), so a round trip leaf -> parent -> leaf is
    // consistent with the last reported value and with controlled mode.
    let keptChecked: Set<TreeId> | null = null;
    for (const id of uncontrolledChecked) {
      if (allIds.has(id)) continue;
      keptChecked ??= new Set(uncontrolledChecked);
      keptChecked.delete(id);
    }
    if (keptChecked) {
      uncontrolledCheckedNow = keptChecked;
      setUncontrolledChecked(keptChecked);
    }
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
      if (keptToggles) {
        setSearchToggles({
          query: searchToggles.query,
          termsMode: searchToggles.termsMode,
          toggled: keptToggles,
        });
      }
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
  const togglesStale =
    searchToggles !== null &&
    (searchToggles.query !== normalizedQuery || searchToggles.termsMode !== termsMode);
  if (togglesStale) setSearchToggles(null);
  const effectiveExpanded = useMemo<ReadonlySet<TreeId>>(() => {
    if (!search) return expandedNow;
    if (!searchToggles || togglesStale || searchToggles.query !== search.query) {
      return search.expandedIds;
    }
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

  // Hiding the dragged node's descendants must not shrink the scrollable height below what
  // the current scroll position needs: the browser would clamp `scrollTop`, and dnd-kit counts
  // that scroll as drag movement, detaching the overlay from the pointer. Only the space the
  // scroll position at drag start requires is kept (see `getDragPaddingRows`); keeping every
  // hidden row would leave a blank tail the auto-scroll could scroll into.
  // The scroll position is read from the DOM once per drag: the render that starts the drag
  // still sees the pre-drag layout. Counting from a second flatten (not from the first node
  // with that id) stays exact when ids are duplicated, which is already reported as an error.
  const dragScroll = useMemo(() => {
    const el = activeDragId === null ? null : containerRef.current;
    return { top: el?.scrollTop ?? 0, view: el?.clientHeight ?? 0 };
  }, [activeDragId]);
  const hiddenRows = useMemo(() => {
    if (activeDragId === null || layoutExpanded === effectiveExpanded) return 0;
    const full = flattenTree(data, effectiveExpanded, search?.visible).length;
    return getDragPaddingRows(
      rows.length,
      full - rows.length,
      dragScroll.top,
      height ?? dragScroll.view,
      rowHeight,
    );
  }, [data, activeDragId, layoutExpanded, effectiveExpanded, search, rows.length, dragScroll, height, rowHeight]);

  // While dragging a list that scrolls, one blank row at the end keeps the "end of the whole
  // tree" zone (the pointer below the last row) at least a row tall, whatever padding/border the
  // container has. Not added to a container that grows with its content (it would shift the
  // layout under the pointer) nor to a short list, which already has blank space below.
  const dragEndRow =
    activeDragId !== null &&
    (rows.length + hiddenRows) * rowHeight > (height ?? dragScroll.view) - (height === undefined ? 0 : rowHeight)
      ? 1
      : 0;
  // When the drag ends the row must not vanish while the scroll position still needs it:
  // the browser would clamp `scrollTop` and the content would jump under the pointer. It is
  // kept until the list is scrolled back to where it is no longer needed. The DOM is read
  // before the commit, so `scrollTop` is still the one of the drag.
  const [keepEndRow, setKeepEndRow] = useState(false);
  const hadEndRow = useRef(0);
  if (hadEndRow.current === 1 && dragEndRow === 0 && !keepEndRow) {
    const el = containerRef.current;
    if (el && el.scrollTop + el.clientHeight > rows.length * rowHeight) setKeepEndRow(true);
  }
  const endRow = dragEndRow === 1 || keepEndRow ? 1 : 0;
  useEffect(() => {
    hadEndRow.current = dragEndRow;
  }, [dragEndRow]);
  const releaseEndRow = () => {
    const el = containerRef.current;
    if (el && el.scrollTop + el.clientHeight <= rows.length * rowHeight) setKeepEndRow(false);
  };
  useEffect(() => {
    if (!keepEndRow) return;
    if (activeDragId !== null) setKeepEndRow(false);
    else releaseEndRow();
  }, [keepEndRow, activeDragId, rows.length, rowHeight]);
  const { start, end, viewport, totalHeight, onScroll: onVirtualScroll, scrollToIndex } = useVirtualRows({
    count: rows.length + hiddenRows + endRow,
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
          const toggled = new Set(
            prev && prev.query === search.query && prev.termsMode === termsMode ? prev.toggled : [],
          );
          if (!toggled.delete(id)) toggled.add(id);
          return { query: search.query, termsMode, toggled };
        });
        return;
      }
      const next = new Set(effectiveExpanded);
      if (!next.delete(id)) next.add(id);
      setExpanded(next);
      onExpandedChange?.([...next]);
    },
    [effectiveExpanded, search, termsMode, onExpandedChange],
  );

  const select = (index: number) => {
    const row = rows[index];
    if (!row || row.item.node.isDisabled) return;
    if (selectedId === undefined) setUncontrolledSelectedId(row.item.id);
    onSelect?.(row.item.id, row.item.node);
  };

  // Checkbox mode: the checked set (controlled prop or internal state), and the derived state
  // of every node, computed on the whole `data` (never on the visible rows) in one O(n) pass.
  const checkedSet = useMemo<ReadonlySet<TreeId>>(
    () => (checkedIdsProp !== undefined ? new Set(checkedIdsProp) : uncontrolledCheckedNow),
    [checkedIdsProp, uncontrolledCheckedNow],
  );
  const checkModel = useMemo(
    () => (checkable ? getCheckStates(data, checkedSet) : null),
    [checkable, data, checkedSet],
  );
  const toggleCheck = (id: TreeId) => {
    const next = toggleChecked(data, checkedSet, id);
    if (!next) return;
    if (checkedIdsProp === undefined) setUncontrolledChecked(new Set(next));
    onCheckedChange?.(next);
  };

  // Context menu: the node (by reference, ids may repeat), its entries and where it opens.
  const [menuState, setMenu] = useState<{
    node: TreeNode<T>;
    data: TreeNode<T>[];
    items: MenuItem<T>[];
    anchor: MenuAnchor;
    rowEl: HTMLElement;
    rowIndex: number;
    source: "pointer" | "keyboard";
    key: number;
  } | null>(null);
  // If a new `data` no longer contains the node the menu is anchored to, close it silently
  // (no consumer notification: it is a consequence of `data`, not a user action). Done during
  // render so a stale menu is never painted. A node that is only hidden (closed branch,
  // search filter) or whose content changed keeps its id and keeps the menu open.
  // If the id is still there the menu follows the node: `menu.node` becomes the new node of
  // that id (first occurrence if ids repeat), so the aria-label and the `onSelect` argument are
  // never stale. `items` stay the ones computed when the menu opened. The O(n) lookup runs
  // only while a menu is open and `data` changed since the last resolution.
  let menu = menuState;
  if (menu !== null && menu.data !== data) {
    if (!allIds.has(menu.node.id)) {
      menu = null;
      setMenu(null);
    } else {
      const fresh = findFirstNode(data, menu.node.id) ?? menu.node;
      menu = { ...menu, node: fresh, data };
      setMenu(menu);
    }
  }
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
      data,
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
    toggleCheck: checkable
      ? (index) => {
          const row = rows[index];
          if (row) toggleCheck(row.item.id);
        }
      : undefined,
  });

  // The roving tabindex row must exist in the DOM, or Tab could not enter the tree on the
  // right row. A focused or selected row is always rendered (positioned with `top`), even
  // when scrolled out of the window. With neither, the default is the first row; if that is
  // out of the window too, the first rendered row takes the tabindex instead.
  const { focusedIndex, anchored, hasFocus } = keyboard;
  const focusedInWindow = focusedIndex >= start && focusedIndex < end;
  // An empty tree has no roving row (focusedIndex -1): nothing to keep mounted.
  const keepTarget = focusedIndex >= 0 && (anchored || hasFocus);
  // While padding rows keep the scroll height, the window can start past the last row.
  const tabbableIndex =
    focusedInWindow || keepTarget ? focusedIndex : Math.max(0, Math.min(start, rows.length - 1));
  const renderedIndexes: number[] = [];
  for (let i = start; i < Math.min(end, rows.length); i++) renderedIndexes.push(i);
  if (keepTarget && !focusedInWindow) renderedIndexes.push(focusedIndex);
  if (tabbableIndex < rows.length && !renderedIndexes.includes(tabbableIndex)) {
    renderedIndexes.push(tabbableIndex);
  }
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
    const cache = createProjectionCache<DropTarget | null, TreeId, DropZone>();
    let flat: FlattenedNode<T>[] | null = null;
    // Offset of the content's top edge from the container's border-box top, at scrollTop 0
    // (padding/border included); measured again only when the cached container rect changes.
    let measuredRect: object | null = null;
    let contentOffset = 0;
    resolverRef.current = (x, y, activeId, subtreeHeight, geometry) => {
      const el = containerRef.current;
      const content = contentRef.current;
      if (search || !el || !content || rows.length === 0) return null;
      // A zero / non-finite row height would turn the row position into NaN (zone "inside").
      if (!(rowHeight > 0) || !Number.isFinite(rowHeight)) return null;
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
      // Row under the pointer and where the pointer sits inside it (0 = top edge, 1 = bottom
      // edge): the vertical band picks "before" / "inside" / "after".
      const rowPosition = (y - top) / rowHeight;
      // Below the last row: the end of the whole tree (last root).
      if (rowPosition >= rows.length) {
        return cache.get(activeId, rows.length, "after", () => {
          flat ??= rows.map((row) => row.item);
          return getEndDropTarget(flat, activeId);
        });
      }
      const overIndex = Math.min(rows.length - 1, Math.max(0, Math.floor(rowPosition)));
      const zone = getDropZone(rowPosition - overIndex);
      return cache.get(activeId, overIndex, zone, () => {
        flat ??= rows.map((row) => row.item);
        return getDropTarget(flat, activeId, overIndex, zone, maxDepth, subtreeHeight);
      });
    };
    return () => {
      resolverRef.current = null;
    };
  }, [resolverRef, rows, rowHeight, search, maxDepth]);

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
        {checkModel && (
          <input
            type="checkbox"
            data-checkbox=""
            // The row (`treeitem`) carries `aria-checked`; the native control is a pointer
            // affordance only, so it is hidden from assistive tech and out of the tab order.
            aria-hidden="true"
            tabIndex={-1}
            checked={state.checkState === true}
            ref={(el) => {
              if (el) el.indeterminate = state.checkState === "mixed";
            }}
            disabled={!interactive || checkModel.locked.has(node.id)}
            readOnly={!interactive}
            onChange={
              interactive
                ? (event) => {
                    // The browser clears `indeterminate` on click and React only restores
                    // `checked`: without a re-render (controlled, parent ignores the change)
                    // the box would look empty while aria-checked says "mixed".
                    const input = event.currentTarget;
                    toggleCheck(node.id);
                    input.indeterminate = state.checkState === "mixed";
                  }
                : () => {}
            }
            // Neither a row click (select) nor the drag sensors must see the pointer.
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => {
              event.stopPropagation();
              // Keep the keyboard on the row (Space/arrows) instead of on the input.
              event.preventDefault();
              event.currentTarget.closest<HTMLElement>('[role="treeitem"]')?.focus({
                preventScroll: true,
              });
            }}
            onTouchStart={(event) => event.stopPropagation()}
            style={{ margin: "0 0.5em 0 0", cursor: "pointer" }}
          />
        )}
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
      checkState: checkModel?.states.get(node.id),
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
        aria-multiselectable={checkable ? true : undefined}
        onScroll={(event) => {
          onVirtualScroll(event);
          if (keepEndRow) releaseEndRow();
        }}
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
                    // The long-press that starts a touch drag also makes Chrome Android send a
                    // contextmenu: neither the library menu nor the native one may open mid-drag.
                    if (dnd && (dnd.touchGesture || dnd.activeId !== null)) {
                      event.preventDefault();
                      return;
                    }
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
              "aria-checked":
                state.checkState === undefined
                  ? undefined
                  : state.checkState === "mixed"
                    ? ("mixed" as const)
                    : state.checkState,
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
