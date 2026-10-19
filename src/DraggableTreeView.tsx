import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ForwardedRef, ReactElement } from "react";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragPendingEvent, DragStartEvent } from "@dnd-kit/core";
import type { ContainerGeometry, DragRowProps, DropResolver, TreeDndAdapter } from "./dnd-internal";
import { createPreviewStore } from "./dnd-internal";
import { findDuplicateIds, findNodeById, getSubtreeHeight, getTreeHeight, moveNode } from "./tree-utils";
import type { DropTarget, TreeId } from "./tree-utils";
import { TreeViewWithDnd, isDevelopment } from "./TreeView";
import type { DraggableTreeViewProps, TreeViewHandle } from "./types";
import {
  DEFAULT_AUTO_SCROLL_MAX_SPEED,
  DEFAULT_AUTO_SCROLL_THRESHOLD,
  useAutoScroll,
} from "./useAutoScroll";

/** Pixels the pointer must travel before a press becomes a drag (so clicks still work). */
const ACTIVATION_DISTANCE = 5;
/** Touch: press-and-hold time (ms) before a drag starts; a quicker swipe still scrolls the tree. */
const TOUCH_ACTIVATION_DELAY = 250;

/** Viewport coordinates of a mouse/pointer/touch event (touch events have no clientX/clientY). */
function getEventPoint(event: Event | null | undefined): { x: number; y: number } | null {
  if (!event) return null;
  const touch = (event as TouchEvent).touches?.[0] ?? (event as TouchEvent).changedTouches?.[0];
  const source = touch ?? (event as Partial<MouseEvent>);
  if (typeof source.clientX !== "number" || typeof source.clientY !== "number") return null;
  return { x: source.clientX, y: source.clientY };
}

/**
 * True from the start of a touch press on a draggable row (the long-press wait of TouchSensor)
 * until the drag ends, is cancelled or the press is aborted (swipe, early release).
 */
const TouchGestureContext = createContext(false);

/**
 * Applied to draggable rows only while a touch gesture is in progress: the long-press that
 * starts a touch drag would otherwise start a native text selection (or callout) that steals the
 * gesture and cancels the drag. Outside of a touch gesture (mouse, keyboard, reading) the text
 * stays selectable.
 */
const NO_SELECT_STYLE = {
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
} as const satisfies CSSProperties;

function DraggableRow({ nodeId, dragDisabled, children, style, ...rest }: DragRowProps) {
  // The draggable id is the node id, never the row position: after a reorder the
  // position belongs to another node, and DragOverlay's drop animation targets the id.
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: nodeId, disabled: dragDisabled });
  const touchGesture = useContext(TouchGestureContext);
  return (
    <div
      ref={setNodeRef}
      {...rest}
      {...listeners}
      style={touchGesture && !dragDisabled ? { ...NO_SELECT_STYLE, ...style } : style}
      data-dragging={isDragging ? "" : undefined}
      data-drag-disabled={dragDisabled ? "" : undefined}
    >
      {children}
    </div>
  );
}

/**
 * Time (ms) the pointer must rest on the chevron of a collapsed node, while dragging, before
 * the node expands. Leaving the chevron earlier cancels it.
 */
export const CHEVRON_HOVER_EXPAND_DELAY = 400;

const renderOverlay: TreeDndAdapter["renderOverlay"] = (content) => (
  <DragOverlay>{content}</DragOverlay>
);

function DraggableTreeViewInner<T = unknown>(
  {
    onTreeChange,
    renderDropIndicator,
    maxDepth: maxDepthProp,
    autoScroll = true,
    autoScrollThreshold = DEFAULT_AUTO_SCROLL_THRESHOLD,
    autoScrollMaxSpeed = DEFAULT_AUTO_SCROLL_MAX_SPEED,
    ...props
  }: DraggableTreeViewProps<T>,
  ref: ForwardedRef<TreeViewHandle>,
) {
  const [activeId, setActiveId] = useState<TreeId | null>(null);
  const [touchGesture, setTouchGesture] = useState(false);
  const resolverRef = useRef<DropResolver | null>(null);
  const expandRef = useRef<((id: TreeId) => void) | null>(null);
  const chevronRef = useRef<((el: Element | null) => TreeId | null) | null>(null);
  // True while the pointer rests on the chevron of a collapsed node and the expand timer runs:
  // no drop is decided there (no indicator, a release does not move the node).
  const chevronPending = useRef(false);
  const scrollElRef = useRef<HTMLElement | null>(null);
  // Set by `useAutoScroll` while it runs: cached container rect + scrollTop for the resolver.
  const geometryRef = useRef<(() => ContainerGeometry) | null>(null);
  // Re-resolves the drop target for the current pointer (set by the drag effect below).
  // `findChevron = false` skips the chevron search (auto-scroll frames, scroll events): the
  // rows move under the pointer, so any running hover timer is cancelled instead.
  const refreshRef = useRef<((findChevron?: boolean) => void) | null>(null);
  const [previewStore] = useState(createPreviewStore);
  // Last known pointer position (viewport coordinates) while dragging. dnd-kit's `delta`
  // includes the scroll that happened during the drag, which the drop resolver already
  // accounts for by reading the live content position, so the pointer is tracked directly.
  const pointer = useRef({ x: 0, y: 0 });
  // Height of the dragged subtree, computed once per drag (on start) and reused on every move.
  const subtreeHeight = useRef<number | undefined>(undefined);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: ACTIVATION_DISTANCE } }),
    // Touch drags need a long-press: a plain swipe keeps scrolling the tree natively, and once
    // the drag is active TouchSensor blocks the scroll, so the gesture is not cancelled.
    useSensor(TouchSensor, {
      activationConstraint: { delay: TOUCH_ACTIVATION_DELAY, tolerance: ACTIVATION_DISTANCE },
    }),
  );

  const { data } = props;
  // Negative or non-integer limits are a mistake: warn (development) and apply no limit.
  const maxDepthValid =
    maxDepthProp === undefined || (Number.isInteger(maxDepthProp) && maxDepthProp >= 0);
  const maxDepth = maxDepthValid ? maxDepthProp : undefined;
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    if (!isDevelopment() || maxDepthValid) return;
    console.warn(
      `[react-virtual-tree-view] Invalid maxDepth: it must be a non-negative integer, got ${String(maxDepthProp)}. No depth limit is applied.`,
    );
  }, [maxDepthValid, maxDepthProp]);

  // Development only: whether `data` is deeper than the limit. Recomputed only when `data` or
  // `maxDepth` change (never in production, never on unrelated renders).
  const exceedsMaxDepth = useMemo(
    () => isDevelopment() && maxDepth !== undefined && getTreeHeight(data) > maxDepth,
    [data, maxDepth],
  );
  // Last maxDepth warned about. Refs survive StrictMode's simulated remount, so the same
  // situation is reported once; it re-arms when `data` returns within the limit.
  const warnedExceeds = useRef<number | null>(null);
  useEffect(() => {
    if (!exceedsMaxDepth || maxDepth === undefined) {
      warnedExceeds.current = null;
      return;
    }
    if (warnedExceeds.current === maxDepth) return;
    warnedExceeds.current = maxDepth;
    console.warn(
      `[react-virtual-tree-view] data already exceeds maxDepth (${maxDepth}). It is shown as is; the limit only applies to new drops.`,
    );
  }, [exceedsMaxDepth, maxDepth]);

  const onDragStart = useCallback(
    ({ active, activatorEvent }: DragStartEvent) => {
      // Known limitation: this is where the press happened. By activation the pointer has
      // moved a few px (the activation distance); the first move event corrects it.
      pointer.current = getEventPoint(activatorEvent) ?? { x: 0, y: 0 };
      const node = maxDepth === undefined ? undefined : findNodeById(dataRef.current, active.id);
      subtreeHeight.current = node ? getSubtreeHeight(node) : undefined;
      setActiveId(active.id);
    },
    [maxDepth],
  );
  // Only the touch sensor has a delay constraint (the mouse waits for a distance instead).
  const onDragPending = useCallback(({ constraint }: DragPendingEvent) => {
    if ("delay" in constraint) setTouchGesture(true);
  }, []);
  const onDragAbort = useCallback(() => setTouchGesture(false), []);

  // moveNode addresses nodes by id: with duplicates a move could drop sibling nodes, so no
  // move is reported and no indicator is shown (it would promise a drop that never happens).
  const hasDuplicateIds = useMemo(() => findDuplicateIds(data).length > 0, [data]);

  // Extra guard while a drag is active: dnd-kit already clears any selection on selectionchange,
  // this also stops a new one from being started. Listener removed on cleanup.
  useEffect(() => {
    if (activeId === null) return;
    const block = (event: Event) => event.preventDefault();
    document.addEventListener("selectstart", block);
    return () => {
      document.removeEventListener("selectstart", block);
      document.getSelection?.()?.removeAllRanges();
    };
  }, [activeId]);

  useEffect(() => {
    if (activeId === null || hasDuplicateIds) return;
    // The resolver memoizes by (row under the pointer, zone of that row): while those do
    // not change it returns the same object and the store is not touched.
    let last: DropTarget | null | undefined;
    // Chevron under the pointer whose expand timer runs (a collapsed node with children).
    let hoverId: TreeId | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Chevron just expanded by the timer, until the pointer leaves it or the tree has re-rendered
    // (the tree then calls `refreshRef`, which finds the row expanded).
    let firedId: TreeId | null = null;
    const clearTimer = () => {
      clearTimeout(timer);
      timer = undefined;
      hoverId = null;
      chevronPending.current = false;
    };
    const refresh = (findChevron = true) => {
      const { x, y } = pointer.current;
      // The whole stack under the pointer: the drag overlay's wrapper sits on top of the row.
      let hit: TreeId | null = null;
      const resolveChevron = findChevron ? chevronRef.current : null;
      if (resolveChevron) {
        const stack =
          typeof document.elementsFromPoint === "function"
            ? document.elementsFromPoint(x, y)
            : [document.elementFromPoint?.(x, y) ?? null];
        for (const el of stack) {
          hit = resolveChevron(el);
          if (hit !== null) break;
        }
      }
      if (hit !== firedId) firedId = null;
      // The dragged node itself is never expanded by its own drag; one just expanded by the
      // timer is only waiting for its re-render (its chevron still reads "collapsed").
      const hovered = hit !== null && hit !== activeId && hit !== firedId ? hit : null;
      if (hovered !== hoverId) {
        clearTimer();
        if (hovered !== null) {
          hoverId = hovered;
          chevronPending.current = true;
          timer = setTimeout(() => {
            const id = hoverId;
            clearTimer();
            if (id === null) return;
            firedId = id;
            expandRef.current?.(id);
          }, CHEVRON_HOVER_EXPAND_DELAY);
        }
      }
      const target =
        hovered !== null
          ? null
          : (resolverRef.current?.(
              x,
              y,
              activeId,
              subtreeHeight.current,
              geometryRef.current?.(),
            ) ?? null);
      if (target === last) return;
      last = target;
      previewStore.set(target ? { projection: target.projection, slot: target.slot } : null);
    };
    // Wheel / programmatic scroll while waiting: the chevron is no longer under the pointer.
    const scrollEl = scrollElRef.current;
    const onScroll = () => {
      if (hoverId !== null) refresh(false);
    };
    const onMove = (event: Event) => {
      const point = getEventPoint(event);
      if (!point) return;
      pointer.current = point;
      refresh();
    };
    refresh();
    refreshRef.current = refresh;
    // `touchmove` too: while a touch drag is active the browser may not deliver pointermove.
    document.addEventListener("pointermove", onMove);
    document.addEventListener("touchmove", onMove);
    scrollEl?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollEl?.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("touchmove", onMove);
      clearTimer();
      refreshRef.current = null;
      previewStore.set(null);
    };
  }, [activeId, previewStore, hasDuplicateIds]);

  // After an auto-scroll step the rows under the (still) pointer changed: refresh the
  // projection. Called at most once per frame, and only if the container really moved.
  // No chevron search here (it would force a layout right after the scroll write, every frame).
  const onAutoScrolled = useCallback(() => refreshRef.current?.(false), []);
  useAutoScroll({
    active: activeId !== null,
    enabled: autoScroll,
    containerRef: scrollElRef,
    pointerRef: pointer,
    geometryRef,
    threshold: autoScrollThreshold,
    maxSpeed: autoScrollMaxSpeed,
    onScrolled: onAutoScrolled,
  });

  const onDragEnd = useCallback(
    ({ active }: DragEndEvent) => {
      setActiveId(null);
      setTouchGesture(false);
      if (hasDuplicateIds) return;
      // Released on the chevron of a collapsed node: no drop was decided there.
      if (chevronPending.current) return;
      const { x, y } = pointer.current;
      const target = resolverRef.current?.(
        x,
        y,
        active.id,
        subtreeHeight.current,
        geometryRef.current?.(),
      );
      if (!target || target.isNoop) return;
      const result = moveNode(data, active.id, target.parentId, target.index);
      if (result.tree === data) return;
      onTreeChange?.(result.tree, {
        nodeId: active.id,
        fromParentId: result.fromParentId,
        toParentId: result.toParentId,
        index: result.index,
      });
      // A collapsed (or leaf) parent must show the node that was just nested under it.
      if (result.toParentId !== null) expandRef.current?.(result.toParentId);
    },
    [data, onTreeChange, hasDuplicateIds],
  );
  const onDragCancel = useCallback(() => {
    setActiveId(null);
    setTouchGesture(false);
  }, []);

  const dnd = useMemo<TreeDndAdapter>(
    () => ({
      activeId,
      touchGesture,
      maxDepth,
      RowShell: DraggableRow,
      resolverRef,
      expandRef,
      chevronRef,
      refreshRef,
      scrollElRef,
      previewStore,
      renderDropIndicator,
      renderOverlay,
    }),
    [activeId, touchGesture, maxDepth, previewStore, renderDropIndicator],
  );

  return (
    <DndContext
      sensors={sensors}
      // dnd-kit's own auto-scroll stays off: `useAutoScroll` scrolls the tree (no double scroll).
      autoScroll={false}
      onDragPending={onDragPending}
      onDragAbort={onDragAbort}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <TouchGestureContext.Provider value={touchGesture}>
        <TreeViewWithDnd<T> {...props} ref={ref} dnd={dnd} />
      </TouchGestureContext.Provider>
    </DndContext>
  );
}

const ForwardedDraggableTreeView = forwardRef(DraggableTreeViewInner);
ForwardedDraggableTreeView.displayName = "DraggableTreeView";

/**
 * `TreeView` with pointer drag & drop to reorder and re-parent a node. `data` is
 * controlled: apply the tree handed to `onTreeChange` to see the move.
 *
 * The row under the pointer and the vertical band of that row decide where the node lands
 * (the horizontal position is irrelevant): the upper ~25% makes it the previous sibling of
 * the row, the middle ~50% makes it a child of the row (its FIRST child), the lower ~25% makes
 * it the next sibling (or the first child, if the row is expanded with visible children). A live indicator shows the result: a
 * line for the two sibling bands, a highlight of the whole row for "becomes a child". The
 * dragged node's descendants are hidden meanwhile and travel with it. Dropping on a collapsed
 * parent expands it. Resting the pointer for 400 ms (`CHEVRON_HOVER_EXPAND_DELAY`) on the
 * chevron of a collapsed node with children expands it (also when the node is disabled: it is
 * only a view change); no drop is decided on that chevron meanwhile. Trees with duplicate ids never report a move and show no indicator. The
 * dragged node itself and a zone refused by `maxDepth` are not drop targets (no indicator,
 * no move). Disabled nodes cannot be dragged but are valid targets in every band.
 *
 * The target parent is expanded right after `onTreeChange` is called, even if the consumer
 * ignores the new tree.
 *
 * `maxDepth`: see `DraggableTreeViewProps.maxDepth` and the README.
 */
export const DraggableTreeView = ForwardedDraggableTreeView as <T = unknown>(
  props: DraggableTreeViewProps<T> & { ref?: ForwardedRef<TreeViewHandle> },
) => ReactElement | null;
