import type { TreeNode } from "./types";

export type TreeId = TreeNode["id"];

export interface FlattenedNode<T = unknown> {
  node: TreeNode<T>;
  id: TreeId;
  /** Root nodes have depth 0. */
  depth: number;
  parentId: TreeId | null;
  /** Position in the flattened array. */
  index: number;
  hasChildren: boolean;
}

export interface Projection {
  depth: number;
  /** Minimum depth allowed by the node that follows the drop position. */
  minDepth: number;
  /** Maximum depth allowed (previous node and `maxDepth` option, never below `minDepth`). */
  maxDepth: number;
  parentId: TreeId | null;
  /** True when the projected depth was cut because of the `maxDepth` option. */
  clamped: boolean;
}

export interface MoveResult<T = unknown> {
  tree: TreeNode<T>[];
  fromParentId: TreeId | null;
  toParentId: TreeId | null;
  index: number;
}

/**
 * Pre-order flattening; only the children of expanded nodes are included.
 * With `visible`, nodes outside that set are skipped (search filtering) and
 * `hasChildren` only counts visible children.
 */
export function flattenTree<T = unknown>(
  tree: TreeNode<T>[],
  expandedIds: ReadonlySet<TreeId> | readonly TreeId[],
  visible?: ReadonlySet<TreeNode<T>>,
): FlattenedNode<T>[] {
  const expanded: ReadonlySet<TreeId> =
    expandedIds instanceof Set ? expandedIds : new Set(expandedIds as readonly TreeId[]);
  const out: FlattenedNode<T>[] = [];
  const visit = (nodes: TreeNode<T>[], depth: number, parentId: TreeId | null) => {
    for (const node of nodes) {
      if (visible && !visible.has(node)) continue;
      const children = node.children;
      const hasChildren =
        !!children && (visible ? children.some((c) => visible.has(c)) : children.length > 0);
      out.push({ node, id: node.id, depth, parentId, index: out.length, hasChildren });
      if (hasChildren && expanded.has(node.id)) visit(children, depth + 1, node.id);
    }
  };
  visit(tree, 0, null);
  return out;
}

/** Height of the subtree rooted at `node`: a leaf is 0. */
export function getSubtreeHeight<T>(node: TreeNode<T>): number {
  let max = 0;
  if (node.children) {
    for (const child of node.children) {
      const h = getSubtreeHeight(child) + 1;
      if (h > max) max = h;
    }
  }
  return max;
}

/**
 * Parent id for the item placed at `overIndex` of `flattened` (the list as it
 * will be after the move) when it sits at `depth`. `null` means root.
 */
export function calculateNewParent<T>(
  flattened: readonly FlattenedNode<T>[],
  overIndex: number,
  depth: number,
): TreeId | null {
  const previous = flattened[overIndex - 1];
  if (depth <= 0 || !previous) return null;
  if (depth === previous.depth) return previous.parentId;
  if (depth > previous.depth) return previous.id;
  for (let i = overIndex - 2; i >= 0; i--) {
    const item = flattened[i];
    if (item && item.depth === depth) return item.parentId;
  }
  return null;
}

/**
 * Drop projection (same algorithm as the dnd-kit "tree" example) with an
 * optional `maxDepth` that also accounts for the height of the dragged subtree.
 * Returns `null` if the active or over id is not in the list.
 */
export function getProjection<T>(
  flattened: readonly FlattenedNode<T>[],
  activeId: TreeId,
  overId: TreeId,
  dragOffset: number,
  indentationWidth: number,
  maxDepth?: number,
): Projection | null {
  const activeIndex = flattened.findIndex((n) => n.id === activeId);
  if (activeIndex === -1) return null;
  const active = flattened[activeIndex];
  if (!active) return null;

  // Descendants are the contiguous run after the active node with greater depth.
  let end = activeIndex + 1;
  while (end < flattened.length && (flattened[end]?.depth ?? 0) > active.depth) end++;
  const without = flattened.slice(0, activeIndex).concat(flattened.slice(end));

  // Where the active node lands: it takes the place of the over item
  // (dnd-kit arrayMove semantics), i.e. after it when moving down.
  let insertAt: number;
  if (overId === activeId) {
    insertAt = activeIndex;
  } else {
    const overWithout = without.findIndex((n) => n.id === overId);
    if (overWithout === -1) return null;
    const overFull = flattened.findIndex((n) => n.id === overId);
    insertAt = overFull > activeIndex ? overWithout + 1 : overWithout;
  }
  const moved = without.slice(0, insertAt).concat(active, without.slice(insertAt));
  return projectAtSlot(moved, insertAt, dragOffset, indentationWidth, maxDepth);
}

/** Projection of the item at `moved[insertAt]` (the dragged node in its new place). */
function projectAtSlot<T>(
  moved: readonly FlattenedNode<T>[],
  insertAt: number,
  dragOffset: number,
  indentationWidth: number,
  maxDepth?: number,
): Projection {
  const active = moved[insertAt]!;
  const previous = moved[insertAt - 1];
  const next = moved[insertAt + 1];
  const prevMax = previous ? previous.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;

  const projected = active.depth + Math.round(dragOffset / indentationWidth);
  const neighbourBound = Math.min(Math.max(projected, minDepth), prevMax);
  let upper = prevMax;
  let clamped = false;
  if (maxDepth !== undefined) {
    const allowed = maxDepth - getSubtreeHeight(active.node);
    if (neighbourBound > allowed) clamped = true;
    upper = Math.min(upper, allowed);
  }
  const effectiveMax = Math.max(upper, minDepth);
  const depth = Math.min(Math.max(projected, minDepth), effectiveMax);

  return {
    depth,
    minDepth,
    maxDepth: effectiveMax,
    parentId: calculateNewParent(moved, insertAt, depth),
    clamped,
  };
}

export interface DropTarget {
  parentId: TreeId | null;
  /** Position among the parent's children once the dragged node has been removed. */
  index: number;
  projection: Projection;
  /**
   * Row index (in `flattened`) above which the drop indicator is drawn: the dragged node
   * would land between row `slot - 1` and row `slot`.
   */
  slot: number;
  /** The drop would leave the tree unchanged (same parent, same position). */
  isNoop: boolean;
}

/**
 * Drop target for a pointer over row `overIndex` of `flattened` (which must not contain the
 * descendants of the dragged node) with the pointer `dragOffset` px to the right of where
 * the drag started. The vertical position picks the slot between rows, the horizontal one
 * the depth (see `getProjection`), so a drop can reorder, nest under the previous row or
 * move up a level. The row under the pointer is the insertion point (before it when moving
 * up, after it and its visible subtree when moving down), whatever its parent: a node can
 * land between the children of another open parent. Returns `null` for unknown ids / out-of-range rows.
 */
export function getDropTarget<T>(
  flattened: readonly FlattenedNode<T>[],
  activeId: TreeId,
  overIndex: number,
  dragOffset: number,
  indentationWidth: number,
  maxDepth?: number,
): DropTarget | null {
  const activeIndex = flattened.findIndex((n) => n.id === activeId);
  const active = flattened[activeIndex];
  if (!active || overIndex < 0 || overIndex >= flattened.length) return null;

  // `slot`: index in `flattened` before which the node is inserted. The row under the
  // pointer is the insertion point: before it when moving up, after it (and after its own
  // visible subtree) when moving down. Rows of other parents are valid slots too; the depth
  // is then limited by the neighbours (`projectAtSlot`).
  let slot = activeIndex;
  if (overIndex < activeIndex) {
    slot = overIndex;
  } else if (overIndex > activeIndex) {
    const overDepth = flattened[overIndex]!.depth;
    slot = overIndex + 1;
    while (slot < flattened.length && flattened[slot]!.depth > overDepth) slot++;
  }

  const without = flattened.slice(0, activeIndex).concat(flattened.slice(activeIndex + 1));
  const insertAt = slot > activeIndex ? slot - 1 : slot;
  const moved = without.slice(0, insertAt).concat(active, without.slice(insertAt));
  const projection = projectAtSlot(moved, insertAt, dragOffset, indentationWidth, maxDepth);

  const previous = moved[insertAt - 1];
  let index = 0;
  if (previous && projection.parentId === previous.id && projection.depth > previous.depth) {
    // Nested under the previous row. If that row is collapsed its children are hidden
    // and the node goes after all of them.
    const following = moved[insertAt + 1];
    if (following?.parentId !== previous.id) {
      index = previous.node.children?.length ?? 0;
      // The dragged node is still counted among its own parent's children.
      if (previous.id === active.parentId) index = Math.max(0, index - 1);
    }
  } else {
    for (let i = 0; i < insertAt; i++) {
      const item = moved[i]!;
      if (item.parentId === projection.parentId && item.depth === projection.depth) index++;
    }
  }

  let currentIndex = 0;
  for (let i = 0; i < activeIndex; i++) {
    const item = flattened[i]!;
    if (item.parentId === active.parentId && item.depth === active.depth) currentIndex++;
  }
  const isNoop = projection.parentId === active.parentId && index === currentIndex;

  return { parentId: projection.parentId, index, projection, slot, isNoop };
}

export interface SiblingDropTarget {
  parentId: TreeId | null;
  /** Position among the parent's children once the dragged node has been removed. */
  index: number;
}

/**
 * Drop target for a same-parent reorder, from the row under the pointer.
 * `flattened` must not contain the descendants of the dragged node (they are hidden
 * while dragging). A row deeper than the dragged node counts as its ancestor sibling,
 * so hovering the children of an expanded sibling drops the node after that sibling.
 * Returns `null` when the row is outside the sibling group (other parent, shallower
 * row), is the dragged node itself, or the drop would not change the order.
 */
export function getSiblingDropTarget<T>(
  flattened: readonly FlattenedNode<T>[],
  activeId: TreeId,
  overIndex: number,
): SiblingDropTarget | null {
  const active = flattened.find((n) => n.id === activeId);
  if (!active || overIndex < 0 || overIndex >= flattened.length) return null;

  let over: FlattenedNode<T> | undefined;
  for (let i = overIndex; i >= 0; i--) {
    const item = flattened[i]!;
    if (item.depth === active.depth) {
      over = item;
      break;
    }
    if (item.depth < active.depth) return null;
  }
  if (!over || over.parentId !== active.parentId || over === active) return null;

  let activePosition = -1;
  let overPosition = -1;
  let position = 0;
  for (const item of flattened) {
    if (item.depth !== active.depth || item.parentId !== active.parentId) continue;
    if (item === active) activePosition = position;
    if (item === over) overPosition = position;
    position++;
  }
  if (activePosition === -1 || overPosition === -1 || overPosition === activePosition) return null;
  return { parentId: active.parentId, index: overPosition };
}

/** Ids that appear more than once in the tree (each reported once). */
export function findDuplicateIds<T>(tree: TreeNode<T>[]): TreeId[] {
  const seen = new Set<TreeId>();
  const dups = new Set<TreeId>();
  const visit = (nodes: TreeNode<T>[]) => {
    for (const n of nodes) {
      if (seen.has(n.id)) dups.add(n.id);
      else seen.add(n.id);
      if (n.children) visit(n.children);
    }
  };
  visit(tree);
  return [...dups];
}

/** Ancestor ids from the root down to the parent. Empty for roots / unknown ids. */
export function getAncestorIds<T>(tree: TreeNode<T>[], id: TreeId): TreeId[] {
  const path: TreeId[] = [];
  const visit = (nodes: TreeNode<T>[]): boolean => {
    for (const n of nodes) {
      if (n.id === id) return true;
      if (n.children && n.children.length > 0) {
        path.push(n.id);
        if (visit(n.children)) return true;
        path.pop();
      }
    }
    return false;
  };
  return visit(tree) ? path : [];
}

/**
 * Immutable move. `index` is the position among the target parent's children
 * once the node has been removed from its old place (clamped to the valid
 * range). `toParentId: null` targets the root level. Invalid moves (unknown
 * ids, target is the node itself or a descendant) return the same tree
 * reference, with `toParentId`/`index` describing the node's current position
 * (`index` is -1 when the node does not exist).
 */
export function moveNode<T>(
  tree: TreeNode<T>[],
  nodeId: TreeId,
  toParentId: TreeId | null,
  index: number,
): MoveResult<T> {
  const parentOf = new Map<TreeId, TreeId | null>();
  const nodeById = new Map<TreeId, TreeNode<T>>();
  const indexInParent = new Map<TreeId, number>();
  const collect = (nodes: TreeNode<T>[], parentId: TreeId | null) => {
    nodes.forEach((n, i) => {
      if (!parentOf.has(n.id)) {
        parentOf.set(n.id, parentId);
        nodeById.set(n.id, n);
        indexInParent.set(n.id, i);
      }
      if (n.children) collect(n.children, n.id);
    });
  };
  collect(tree, null);

  const fromParentId = parentOf.get(nodeId) ?? null;
  const noop: MoveResult<T> = {
    tree,
    fromParentId,
    toParentId: fromParentId,
    index: indexInParent.get(nodeId) ?? -1,
  };

  const node = nodeById.get(nodeId);
  if (!node) return noop;
  if (toParentId !== null) {
    if (!nodeById.has(toParentId)) return noop;
    // walk up from the target: meeting the node means the target is inside it
    let cursor: TreeId | null = toParentId;
    for (let steps = 0; cursor !== null && steps <= parentOf.size; steps++) {
      if (cursor === nodeId) return noop;
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  let finalIndex = 0;
  const rewrite = (children: TreeNode<T>[], parentId: TreeId | null): TreeNode<T>[] => {
    let changed = false;
    let next = children.map((child) => {
      // a leaf target has no `children` yet: recurse with an empty list
      if (!child.children && child.id !== toParentId) return child;
      const oldChildren = child.children ?? [];
      const newChildren = rewrite(oldChildren, child.id);
      if (newChildren === oldChildren) return child;
      changed = true;
      return { ...child, children: newChildren };
    });
    if (parentId === fromParentId) {
      // by reference, not by id: a sibling sharing the id must not be removed too
      next = next.filter((c) => c !== node);
      changed = true;
    }
    if (parentId === toParentId) {
      finalIndex = Math.max(0, Math.min(index, next.length));
      next = [...next.slice(0, finalIndex), node, ...next.slice(finalIndex)];
      changed = true;
    }
    return changed ? next : children;
  };

  return { tree: rewrite(tree, null), fromParentId, toParentId, index: finalIndex };
}
