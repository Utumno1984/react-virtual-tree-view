import type { ComponentType, HTMLAttributes, MutableRefObject, ReactNode } from "react";
import type { DropTarget, Projection, TreeId } from "./tree-utils";

/** Props of the element that wraps a row when drag & drop is enabled (internal). */
export interface DragRowProps extends HTMLAttributes<HTMLDivElement> {
  nodeId: TreeId;
  /** The row cannot be dragged (disabled node or active search). */
  dragDisabled: boolean;
}

/**
 * Resolves the drop target for a pointer position in viewport coordinates, `dx` px to the
 * right of where the drag started (internal). `null` when the pointer is outside the tree.
 */
export type DropResolver = (x: number, y: number, activeId: TreeId, dx: number) => DropTarget | null;

/** Where the drop indicator is drawn, in tree coordinates. */
export interface DropPreview {
  projection: Projection;
  /** Row index above which the indicator sits. */
  slot: number;
}

/** Tiny external store so only the indicator re-renders while the pointer moves. */
export interface PreviewStore {
  get: () => DropPreview | null;
  set: (preview: DropPreview | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPreviewStore(): PreviewStore {
  let value: DropPreview | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (next === value) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

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
  /** The tree assigns a function that expands a node (state + `onExpandedChange`). */
  expandRef: MutableRefObject<((id: TreeId) => void) | null>;
  /** Live projection shown by the drop indicator. */
  previewStore: PreviewStore;
  /** Custom indicator content; the default is a minimal line. */
  renderDropIndicator?: (projection: Projection) => ReactNode;
  /** Renders the drag overlay with the dragged row's content. */
  renderOverlay: (content: ReactNode | null) => ReactNode;
}
