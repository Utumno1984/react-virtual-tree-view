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
  /** Rendered inside the tree container when `data` is empty. */
  emptyState?: React.ReactNode;
}
