import { forwardRef, useCallback, useMemo, useRef, useState } from "react";
import type { ForwardedRef, ReactElement } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { DragRowProps, DropResolver, TreeDndAdapter } from "./dnd-internal";
import { moveNode } from "./tree-utils";
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
  const origin = useRef({ x: 0, y: 0 });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: ACTIVATION_DISTANCE } }),
  );

  const onDragStart = useCallback(({ active, activatorEvent }: DragStartEvent) => {
    const event = activatorEvent as Partial<PointerEvent>;
    origin.current = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
    setActiveId(active.id);
  }, []);

  const { data } = props;
  const onDragEnd = useCallback(
    ({ active, delta }: DragEndEvent) => {
      setActiveId(null);
      const target = resolverRef.current?.(
        origin.current.x + delta.x,
        origin.current.y + delta.y,
        active.id,
      );
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
    [data, onTreeChange],
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
 */
export const DraggableTreeView = ForwardedDraggableTreeView as <T = unknown>(
  props: DraggableTreeViewProps<T> & { ref?: ForwardedRef<TreeViewHandle> },
) => ReactElement | null;
