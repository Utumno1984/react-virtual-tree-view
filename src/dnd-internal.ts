import type { ComponentType, HTMLAttributes, MutableRefObject, ReactNode } from "react";
import type { SiblingDropTarget, TreeId } from "./tree-utils";

/** Props of the element that wraps a row when drag & drop is enabled (internal). */
export interface DragRowProps extends HTMLAttributes<HTMLDivElement> {
  nodeId: TreeId;
  /** The row cannot be dragged (disabled node or active search). */
  dragDisabled: boolean;
}

/** Resolves the drop target for a pointer position in viewport coordinates (internal). */
export type DropResolver = (x: number, y: number, activeId: TreeId) => SiblingDropTarget | null;

/**
 * Seam between `TreeView` and `DraggableTreeView` (internal, not exported from the package):
 * the tree stays free of any `@dnd-kit` import, the draggable wrapper plugs these in.
 */
export interface TreeDndAdapter {
  /** Id of the node being dragged; its descendants are hidden meanwhile. */
  activeId: TreeId | null;
  /** Replaces the row `<div>`; registers the row as a draggable. */
  RowShell: ComponentType<DragRowProps>;
  /** The tree assigns its pointer-to-target resolver here on every commit. */
  resolverRef: MutableRefObject<DropResolver | null>;
  /** Renders the drag overlay with the dragged row's content. */
  renderOverlay: (content: ReactNode | null) => ReactNode;
}
