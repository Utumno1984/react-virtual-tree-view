import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ForwardedRef, ReactElement } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { DragRowProps, DropResolver, TreeDndAdapter } from "./dnd-internal";
import { findDuplicateIds, moveNode } from "./tree-utils";
import type { TreeId } from "./tree-utils";
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
  { onTreeChange, ...props }: DraggableTreeViewProps<T>,
  ref: ForwardedRef<TreeViewHandle>,
) {
  const [activeId, setActiveId] = useState<TreeId | null>(null);
  const resolverRef = useRef<DropResolver | null>(null);
  // Last known pointer position (viewport coordinates) while dragging. dnd-kit's `delta`
  // includes the scroll that happened during the drag, which the drop resolver already
  // accounts for by reading the live content position, so the pointer is tracked directly.
  const pointer = useRef({ x: 0, y: 0 });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: ACTIVATION_DISTANCE } }),
  );

  const onDragStart = useCallback(({ active, activatorEvent }: DragStartEvent) => {
    const event = activatorEvent as Partial<PointerEvent>;
    pointer.current = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
    setActiveId(active.id);
  }, []);

  useEffect(() => {
    if (activeId === null) return;
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [activeId]);

  const { data } = props;
  // moveNode addresses nodes by id: with duplicates a move could drop sibling nodes.
  const hasDuplicateIds = useMemo(() => findDuplicateIds(data).length > 0, [data]);
  const onDragEnd = useCallback(
    ({ active }: DragEndEvent) => {
      setActiveId(null);
      if (hasDuplicateIds) return;
      const target = resolverRef.current?.(pointer.current.x, pointer.current.y, active.id);
      if (!target) return;
      const result = moveNode(data, active.id, target.parentId, target.index);
      if (result.tree === data) return;
      onTreeChange?.(result.tree, {
        nodeId: active.id,
        fromParentId: result.fromParentId,
        toParentId: result.toParentId,
        index: result.index,
      });
    },
    [data, onTreeChange, hasDuplicateIds],
  );
  const onDragCancel = useCallback(() => setActiveId(null), []);

  const dnd = useMemo<TreeDndAdapter>(
    () => ({ activeId, RowShell: DraggableRow, resolverRef, renderOverlay }),
    [activeId],
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
 * `TreeView` with pointer drag & drop to reorder a node among its siblings. `data` is
 * controlled: apply the tree handed to `onTreeChange` to see the move.
 *
 * The drop target is the row under the pointer. Dragging upwards onto a child of an
 * expanded sibling places the node before that sibling (the target is always a position
 * among the dragged node's own siblings). Trees with duplicate ids never report a move.
 */
export const DraggableTreeView = ForwardedDraggableTreeView as <T = unknown>(
  props: DraggableTreeViewProps<T> & { ref?: ForwardedRef<TreeViewHandle> },
) => ReactElement | null;
