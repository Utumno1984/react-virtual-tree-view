import type * as React from "react";

export interface TreeNode<T = unknown> {
  id: string | number;
  label: string;
  children?: TreeNode<T>[];
  isDisabled?: boolean;
  data?: T;
}

/** State handed to `renderNode`, `renderIcon` and `rowClassName`. */
export interface RenderNodeState {
  depth: number;
  isExpanded: boolean;
  isDisabled: boolean;
  hasChildren: boolean;
}

export interface TreeViewProps<T = unknown> {
  data: TreeNode<T>[];
  /** Ids of the nodes that start expanded (read on mount only). */
  defaultExpandedIds?: ReadonlyArray<TreeNode["id"]>;
  /** Called on every expand/collapse with the updated set of expanded ids. */
  onExpandedChange?: (expandedIds: Array<TreeNode["id"]>) => void;
  /** Pixels of indentation per depth level. Default 24. */
  indentation?: number;
  /** Custom row content. Defaults to the node `label`. */
  renderNode?: (node: TreeNode<T>, state: RenderNodeState) => React.ReactNode;
  /** Custom toggle indicator. Defaults to a minimal text glyph. */
  renderIcon?: (state: RenderNodeState) => React.ReactNode;
  className?: string;
  rowClassName?: string | ((state: RenderNodeState) => string);
  /** Rendered next to (not inside) the `role="tree"` container when `data` is empty. */
  emptyState?: React.ReactNode;
  /** Height in px of every row (fixed). Default 32. */
  rowHeight?: number;
  /** Viewport height in px. When omitted the tree fills its parent (give the parent a height). */
  height?: number;
  /** Extra rows rendered above and below the visible area. Default 5. */
  overscan?: number;
  /** Accessible name of the tree. */
  "aria-label"?: string;
  /** Id of the element that names the tree. */
  "aria-labelledby"?: string;
}

/** Imperative handle exposed through `ref`. */
export interface TreeViewHandle {
  /** Scrolls the row of `id` into view. No-op for unknown ids or nodes in a collapsed branch. */
  scrollToId: (id: TreeNode["id"]) => void;
}
