import type * as React from "react";
import type { Projection } from "./tree-utils";

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
  /**
   * Enables a context menu on the nodes (right click, Shift+F10 or the ContextMenu key).
   * The library defines no actions: `items(node)` returns them. See `TreeContextMenu`.
   */
  contextMenu?: TreeContextMenuOptions<T>;
  /** Accessible name of the tree. */
  "aria-label"?: string;
  /** Id of the element that names the tree. */
  "aria-labelledby"?: string;
}

/** Describes a completed drag, passed to `DraggableTreeView`'s `onTreeChange`. */
export interface TreeChangeEvent {
  /** Id of the node that was moved. */
  nodeId: TreeNode["id"];
  /** Parent before the move; `null` for a root node. */
  fromParentId: TreeNode["id"] | null;
  /** Parent after the move; `null` for the root level. */
  toParentId: TreeNode["id"] | null;
  /** Position among the new parent's children. */
  index: number;
}

export interface DraggableTreeViewProps<T = unknown> extends TreeViewProps<T> {
  /**
   * Called when a drop changes the tree, with the new tree and a description of the move.
   * `data` is controlled: if you do not update it, the displayed tree does not change.
   * Not called for a drop in the starting position, outside the tree, or after Esc.
   */
  onTreeChange?: (tree: TreeNode<T>[], event: TreeChangeEvent) => void;
  /**
   * Maximum depth of the tree (roots are 0), counting the dragged node's own subtree: during
   * a drag the projection is cut so that neither the node nor any descendant goes deeper
   * (the drop is not refused). Must be a non-negative integer; anything else warns in
   * development and means no limit. `data` that already exceeds it is shown as is (with a
   * development warning): the limit only applies to new drops. Known limit: a drop between
   * rows that are already deeper than `maxDepth` cannot go shallower than them, so it can end
   * up beyond the limit; the projection is flagged `clamped: true` but the node is not
   * relocated. Check `clamped` (drop indicator `data-depth-clamped`, `projection.clamped`)
   * even when the starting `data` does not respect `maxDepth`, not only for shallow new drops.
   */
  maxDepth?: number;
  /**
   * Scroll the tree while dragging with the pointer near its top/bottom edge, faster the closer
   * the pointer is to the edge. Default `true`; `false` disables it (dnd-kit's own auto-scroll
   * is always off, so there is never a double scroll).
   */
  autoScroll?: boolean;
  /** Height in px of the auto-scroll band at each edge of the tree. Default 40. */
  autoScrollThreshold?: number;
  /** Maximum auto-scroll speed in px per frame, reached at the very edge. Default 20. */
  autoScrollMaxSpeed?: number;
  /**
   * Content of the drop indicator shown while dragging, for styling it. It is wrapped in an
   * element (`data-drop-indicator`, `data-projected-depth`) already positioned between the two
   * rows and indented to `projection.depth * indentation`. Defaults to a minimal line.
   * The wrapper also carries `data-depth-clamped` ("true" when `maxDepth` cut the
   * projection); `projection.clamped` is available here too.
   */
  renderDropIndicator?: (projection: Projection) => React.ReactNode;
}

/** An entry of the context menu; the consumer defines it, the library has no default actions. */
export interface MenuItem<T = unknown> {
  /** Must be unique within the list returned for a node (it is used as the React key). */
  id: string | number;
  label: string;
  /** Called once, with the node the menu was opened on, when the item is chosen. */
  onSelect: (node: TreeNode<T>) => void;
  /** A disabled item is shown with `aria-disabled="true"`, skipped by the arrows and inert. */
  disabled?: boolean;
}

/** `TreeView`'s `contextMenu` prop. */
export interface TreeContextMenuOptions<T = unknown> {
  /**
   * Entries for a node. Called for every node, disabled ones included. Returning `[]` means
   * "no menu for this node": the library menu does not open and the native one is not blocked.
   */
  items: (node: TreeNode<T>) => MenuItem<T>[];
  className?: string;
  itemClassName?: string;
  /** Custom content of an item. Defaults to `item.label`. */
  renderItem?: (item: MenuItem<T>) => React.ReactNode;
  /** Accessible name of the menu. Defaults to the node label. */
  "aria-label"?: string;
}

/** Where the menu opens, in viewport coordinates. */
export interface MenuAnchor {
  x: number;
  y: number;
  /** Alternative `y` (the top of the row) used to flip the menu above when it would overflow. */
  altY?: number;
}

/** Props of the standalone `TreeContextMenu` component (`TreeView` renders it for you). */
export interface TreeContextMenuProps<T = unknown>
  extends Omit<TreeContextMenuOptions<T>, "items"> {
  /** The node the menu was opened on; handed to `onSelect`. */
  node: TreeNode<T>;
  items: MenuItem<T>[];
  anchor: MenuAnchor;
  /** Called when the menu wants to close; `restoreFocus` asks to refocus the originating row. */
  onClose: (restoreFocus: boolean) => void;
}

/** Imperative handle exposed through `ref`. */
export interface TreeViewHandle {
  /** Scrolls the row of `id` into view. No-op for unknown ids or nodes in a collapsed branch. */
  scrollToId: (id: TreeNode["id"]) => void;
}
