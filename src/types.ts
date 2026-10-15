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
  /** This node is the selected one. */
  isSelected: boolean;
  /** The tree has focus and this is its focused row. */
  isFocused: boolean;
  /** A non-empty `searchQuery` is active (the drag is meant to be disabled meanwhile). */
  isSearching: boolean;
  /** Searching, and this node's `label` contains the query. */
  isMatch: boolean;
  /** `[start, end)` offsets of every occurrence of the query in `label`; `[]` unless `isMatch`. */
  matchRanges: Array<[number, number]>;
}

export interface TreeViewProps<T = unknown> {
  data: TreeNode<T>[];
  /** Ids of the nodes that start expanded (read on mount only). */
  defaultExpandedIds?: ReadonlyArray<TreeNode["id"]>;
  /** Called on every expand/collapse with the updated set of expanded ids. */
  onExpandedChange?: (expandedIds: Array<TreeNode["id"]>) => void;
  /**
   * Controlled selection. When defined the selection only changes when the parent updates
   * it (`null` = nothing selected); `onSelect` is still called on every user selection.
   */
  selectedId?: TreeNode["id"] | null;
  /** Initially selected id for the uncontrolled mode (read on mount only). */
  defaultSelectedId?: TreeNode["id"];
  /** Called when the user selects an enabled node (click, Enter or Space). */
  onSelect?: (id: TreeNode["id"], node: TreeNode<T>) => void;
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
  /**
   * Case-insensitive substring filter on `label` (surrounding whitespace ignored, no regex).
   * Only matches and their ancestors are shown, ancestors expanded, and the matched text is
   * wrapped in `<mark>` (unless `renderNode` is used). Clearing it restores the previous
   * expansion exactly. Expanding/collapsing while searching is temporary and does not call
   * `onExpandedChange`.
   *
   * Memoize `data` (e.g. `useMemo`) so the O(n) search pass does not rerun on every render.
   * The library does not announce results to screen readers: render the result count or
   * `noResults` inside your own `aria-live="polite"` region if you need that.
   */
  searchQuery?: string;
  /**
   * Rendered next to the tree when `searchQuery` is active and nothing matches. Not announced
   * automatically: wrap it in an `aria-live` region yourself if needed.
   */
  noResults?: React.ReactNode;
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
