import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ForwardedRef, ReactElement } from "react";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
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

function DraggableRow({ nodeId, dragDisabled, children, style, ...rest }: DragRowProps) {
  // The draggable id is the node id, never the row position: after a reorder the
  // position belongs to another node, and DragOverlay's drop animation targets the id.
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: nodeId, disabled: dragDisabled });
  return (
    <div
      ref={setNodeRef}
      {...rest}
      {...listeners}
      style={style}
      data-dragging={isDragging ? "" : undefined}
      data-drag-disabled={dragDisabled ? "" : undefined}
    >
      {children}
    </div>
  );
}

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
  const resolverRef = useRef<DropResolver | null>(null);
  const expandRef = useRef<((id: TreeId) => void) | null>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  // Set by `useAutoScroll` while it runs: cached container rect + scrollTop for the resolver.
  const geometryRef = useRef<(() => ContainerGeometry) | null>(null);
  // Re-resolves the drop target for the current pointer (set by the drag effect below).
  const refreshRef = useRef<(() => void) | null>(null);
  const [previewStore] = useState(createPreviewStore);
  // Last known pointer position (viewport coordinates) while dragging. dnd-kit's `delta`
  // includes the scroll that happened during the drag, which the drop resolver already
  // accounts for by reading the live content position, so the pointer is tracked directly.
  const pointer = useRef({ x: 0, y: 0 });
  // Where the pointer was when the drag started: the horizontal offset sets the depth.
  const origin = useRef({ x: 0, y: 0 });
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
      origin.current = pointer.current;
      const node = maxDepth === undefined ? undefined : findNodeById(dataRef.current, active.id);
      subtreeHeight.current = node ? getSubtreeHeight(node) : undefined;
      setActiveId(active.id);
    },
    [maxDepth],
  );

  // moveNode addresses nodes by id: with duplicates a move could drop sibling nodes, so no
  // move is reported and no indicator is shown (it would promise a drop that never happens).
  const hasDuplicateIds = useMemo(() => findDuplicateIds(data).length > 0, [data]);

  useEffect(() => {
    if (activeId === null || hasDuplicateIds) return;
    // The resolver memoizes by (row under the pointer, indentation steps): while those do
    // not change it returns the same object and the store is not touched.
    let last: DropTarget | null | undefined;
    const refresh = () => {
      const { x, y } = pointer.current;
      const target =
        resolverRef.current?.(
          x,
          y,
          activeId,
          x - origin.current.x,
          subtreeHeight.current,
          geometryRef.current?.(),
        ) ?? null;
      if (target === last) return;
      last = target;
      previewStore.set(target ? { projection: target.projection, slot: target.slot } : null);
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
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("touchmove", onMove);
      refreshRef.current = null;
      previewStore.set(null);
    };
  }, [activeId, previewStore, hasDuplicateIds]);

  // After an auto-scroll step the rows under the (still) pointer changed: refresh the
  // projection. Called at most once per frame, and only if the container really moved.
  const onAutoScrolled = useCallback(() => refreshRef.current?.(), []);
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
      if (hasDuplicateIds) return;
      const { x, y } = pointer.current;
      const target = resolverRef.current?.(
        x,
        y,
        active.id,
        x - origin.current.x,
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
  const onDragCancel = useCallback(() => setActiveId(null), []);

  const dnd = useMemo<TreeDndAdapter>(
    () => ({
      activeId,
      maxDepth,
      RowShell: DraggableRow,
      resolverRef,
      expandRef,
      scrollElRef,
      previewStore,
      renderDropIndicator,
      renderOverlay,
    }),
    [activeId, maxDepth, previewStore, renderDropIndicator],
  );

  return (
    <DndContext
      sensors={sensors}
      // dnd-kit's own auto-scroll stays off: `useAutoScroll` scrolls the tree (no double scroll).
      autoScroll={false}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <TreeViewWithDnd<T> {...props} ref={ref} dnd={dnd} />
    </DndContext>
  );
}

const ForwardedDraggableTreeView = forwardRef(DraggableTreeViewInner);
ForwardedDraggableTreeView.displayName = "DraggableTreeView";

/**
 * `TreeView` with pointer drag & drop to reorder and re-parent a node. `data` is
 * controlled: apply the tree handed to `onTreeChange` to see the move.
 *
 * The row under the pointer picks the position, the horizontal offset from where the drag
 * started picks the depth (one `indentation` per level, limited to what the neighbours
 * allow): right nests under the previous row, left moves up a level. A live indicator shows
 * the projection. The dragged node's descendants are hidden meanwhile and travel with it.
 * Dropping on a collapsed parent expands it. Trees with duplicate ids never report a move
 * and show no indicator.
 *
 * The row under the pointer is the insertion point whatever its parent (before it when
 * moving up, after it when moving down), so dropping on a row of a different parent moves the
 * node there (unlike a plain same-parent reorder). The target parent is expanded right after
 * `onTreeChange` is called, even if the consumer ignores the new tree.
 *
 * `maxDepth` known limit with non-conforming `data` (a drop can end up beyond the limit, and
 * `clamped` alone does not tell): see `DraggableTreeViewProps.maxDepth` and the README.
 */
export const DraggableTreeView = ForwardedDraggableTreeView as <T = unknown>(
  props: DraggableTreeViewProps<T> & { ref?: ForwardedRef<TreeViewHandle> },
) => ReactElement | null;
