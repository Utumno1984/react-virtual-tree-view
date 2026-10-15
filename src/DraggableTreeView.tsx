import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ForwardedRef, ReactElement } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { DragRowProps, DropResolver, TreeDndAdapter } from "./dnd-internal";
import { createPreviewStore } from "./dnd-internal";
import { findDuplicateIds, moveNode } from "./tree-utils";
import type { DropTarget, TreeId } from "./tree-utils";
import { TreeViewWithDnd } from "./TreeView";
import type { DraggableTreeViewProps, TreeViewHandle } from "./types";

/** Pixels the pointer must travel before a press becomes a drag (so clicks still work). */
const ACTIVATION_DISTANCE = 5;

function DraggableRow({ nodeId, dragDisabled, children, ...rest }: DragRowProps) {
  // The draggable id is the node id, never the row position: after a reorder the
  // position belongs to another node, and DragOverlay's drop animation targets the id.
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: nodeId, disabled: dragDisabled });
  return (
    <div
      ref={setNodeRef}
      {...rest}
      {...listeners}
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
  { onTreeChange, renderDropIndicator, ...props }: DraggableTreeViewProps<T>,
  ref: ForwardedRef<TreeViewHandle>,
) {
  const [activeId, setActiveId] = useState<TreeId | null>(null);
  const resolverRef = useRef<DropResolver | null>(null);
  const expandRef = useRef<((id: TreeId) => void) | null>(null);
  const [previewStore] = useState(createPreviewStore);
  // Last known pointer position (viewport coordinates) while dragging. dnd-kit's `delta`
  // includes the scroll that happened during the drag, which the drop resolver already
  // accounts for by reading the live content position, so the pointer is tracked directly.
  const pointer = useRef({ x: 0, y: 0 });
  // Where the pointer was when the drag started: the horizontal offset sets the depth.
  const origin = useRef({ x: 0, y: 0 });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: ACTIVATION_DISTANCE } }),
  );

  const onDragStart = useCallback(({ active, activatorEvent }: DragStartEvent) => {
    const event = activatorEvent as Partial<PointerEvent>;
    pointer.current = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
    origin.current = pointer.current;
    setActiveId(active.id);
  }, []);

  const { data } = props;
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
      const target = resolverRef.current?.(x, y, activeId, x - origin.current.x) ?? null;
      if (target === last) return;
      last = target;
      previewStore.set(target ? { projection: target.projection, slot: target.slot } : null);
    };
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      refresh();
    };
    refresh();
    document.addEventListener("pointermove", onMove);
    return () => {
      document.removeEventListener("pointermove", onMove);
      previewStore.set(null);
    };
  }, [activeId, previewStore, hasDuplicateIds]);

  const onDragEnd = useCallback(
    ({ active }: DragEndEvent) => {
      setActiveId(null);
      if (hasDuplicateIds) return;
      const { x, y } = pointer.current;
      const target = resolverRef.current?.(x, y, active.id, x - origin.current.x);
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
      RowShell: DraggableRow,
      resolverRef,
      expandRef,
      previewStore,
      renderDropIndicator,
      renderOverlay,
    }),
    [activeId, previewStore, renderDropIndicator],
  );

  return (
    <DndContext
      sensors={sensors}
      // Auto-scroll is a later feature; the drop math assumes a container that stays put.
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
 */
export const DraggableTreeView = ForwardedDraggableTreeView as <T = unknown>(
  props: DraggableTreeViewProps<T> & { ref?: ForwardedRef<TreeViewHandle> },
) => ReactElement | null;
