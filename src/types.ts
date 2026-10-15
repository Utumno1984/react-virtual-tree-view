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
  /** Height in px of every row (fixed, must be > 0; invalid values fall back to 32). Default 32. */
  rowHeight?: number;
  /**
   * Viewport height in px. When omitted no inline height is set: size the tree with CSS
   * (e.g. `className="h-96"`, or a parent with a bounded height). The viewport is then
   * measured with a `ResizeObserver`. If the tree ends up as tall as all its rows
   * (auto height), every row is rendered and nothing is virtualized.
   *
   * Performance: with a fixed `height`, a tree of 10,000 nodes mounts in under 2 seconds
   * and only the visible rows (plus `overscan`) are in the DOM.
   */
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
