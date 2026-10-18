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
  /** Depth the dragged node would get (root = 0). */
  depth: number;
  /** Always equal to `depth` (kept for compatibility: the depth no longer ranges). */
  minDepth: number;
  /** Always equal to `depth` (kept for compatibility: the depth no longer ranges). */
  maxDepth: number;
  parentId: TreeId | null;
  /** Always `false` (kept for compatibility): `maxDepth` refuses a zone instead of cutting the depth. */
  clamped: boolean;
  /** Band of the hovered row the drop falls on. */
  zone: DropZone;
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

/**
 * Number of rows `node` contributes below itself in the flattened list: its descendants that
 * are visible given `expandedIds` (the children of a collapsed node are not counted). O(subtree).
 */
export function countVisibleDescendants<T>(
  node: TreeNode<T>,
  expandedIds: ReadonlySet<TreeId>,
): number {
  let count = 0;
  const stack: TreeNode<T>[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const children = current.children;
    if (!children || children.length === 0 || !expandedIds.has(current.id)) continue;
    count += children.length;
    for (const child of children) stack.push(child);
  }
  return count;
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

/** First node (pre-order) with the given id, or `undefined`. O(n). */
export function findNodeById<T>(tree: TreeNode<T>[], id: TreeId): TreeNode<T> | undefined {
  const stack: TreeNode<T>[] = [];
  for (let i = tree.length - 1; i >= 0; i--) stack.push(tree[i]!);
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === id) return node;
    const children = node.children;
    if (children) for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!);
  }
  return undefined;
}

/** Height of the tallest root subtree (an empty tree or a flat list is 0). */
export function getTreeHeight<T>(tree: TreeNode<T>[]): number {
  let max = 0;
  for (const node of tree) max = Math.max(max, getSubtreeHeight(node));
  return max;
}

/**
 * Where, relative to the hovered row, the dragged node would land:
 * - `"before"`: previous sibling of the row (upper band of the row);
 * - `"inside"`: child of the row, inserted as its FIRST child (middle band);
 * - `"after"`: next sibling of the row, after the row's whole visible subtree (lower band).
 */
export type DropZone = "before" | "inside" | "after";

/** Fraction of the row height taken by each of the upper ("before") and lower ("after") bands. */
export const DROP_ZONE_EDGE = 0.25;

/**
 * Zone for a pointer at `fraction` of the hovered row's height (0 = top edge, 1 = bottom edge):
 * the upper 25% is `"before"`, the lower 25% `"after"`, the middle 50% `"inside"`.
 */
export function getDropZone(fraction: number): DropZone {
  if (fraction < DROP_ZONE_EDGE) return "before";
  if (fraction >= 1 - DROP_ZONE_EDGE) return "after";
  return "inside";
}

/**
 * Parent id of a node dropped on `zone` of row `overIndex` of `flattened`: the row itself for
 * `"inside"`, the row's own parent for `"before"` / `"after"`. `null` means root; also `null`
 * for an out-of-range row.
 */
export function calculateNewParent<T>(
  flattened: readonly FlattenedNode<T>[],
  overIndex: number,
  zone: DropZone,
): TreeId | null {
  const over = flattened[overIndex];
  if (!over) return null;
  return zone === "inside" ? over.id : over.parentId;
}

/**
 * Drop projection for a pointer on `zone` of the row `overId` (see `getDropTarget` for the
 * model and the validity rules). Same as `getDropTarget` but addressed by id and without the
 * insertion index. Returns `null` when the active or over id is not in the list or the drop is
 * not valid.
 */
export function getProjection<T>(
  flattened: readonly FlattenedNode<T>[],
  activeId: TreeId,
  overId: TreeId,
  zone: DropZone,
  maxDepth?: number,
): Projection | null {
  const overIndex = flattened.findIndex((n) => n.id === overId);
  if (overIndex === -1) return null;
  return getDropTarget(flattened, activeId, overIndex, zone, maxDepth)?.projection ?? null;
}

export interface DropTarget {
  parentId: TreeId | null;
  /** Position among the parent's children once the dragged node has been removed. */
  index: number;
  projection: Projection;
  /**
   * Row index (in `flattened`) of the drop indicator. For `"before"` / `"after"` the dragged
   * node lands between row `slot - 1` and row `slot` (a line is drawn above row `slot`); for
   * `"inside"` it is the hovered row itself, the one to highlight.
   */
  slot: number;
  /** The drop would leave the tree unchanged (same parent, same position). */
  isNoop: boolean;
}

/**
 * Drop target for a pointer over row `overIndex` of `flattened` (which must not contain the
 * descendants of the dragged node), on the vertical band `zone` of that row. Only the hovered
 * row and the band matter, not the horizontal position of the pointer:
 *
 * - `"before"` (upper ~25% of the row): previous sibling of the row, same parent, right before it;
 * - `"inside"` (middle ~50%): child of the row, inserted as its FIRST child (so it shows right
 *   below the row once the parent is expanded; a collapsed parent is expanded on drop);
 * - `"after"` (lower ~25%): next sibling of the row, right after it, when the row is collapsed or
 *   a leaf. On an EXPANDED row with visible children it is the FIRST CHILD instead (like
 *   `"inside"`, but the line is drawn right below the row, `slot = overIndex + 1`), so the
 *   indicator is always next to the pointer, even with a very long subtree. To drop after an
 *   expanded row's subtree, use the upper band of the next row or the lower band of its last row.
 *
 * Not valid (`null`): the dragged node itself or one of its descendants, an out-of-range row,
 * an unknown `activeId`, and, with `maxDepth`, a zone that would put the node (with its whole
 * subtree, see `getSubtreeHeight`) deeper than the limit: `"inside"` needs
 * `row.depth + 1 + height <= maxDepth`, `"before"` / `"after"` need `row.depth + height <=
 * maxDepth`. A subtree already taller than `maxDepth` is still allowed at the root level
 * (the shallowest depth), nowhere else. Pass `subtreeHeight` to avoid recomputing the height on
 * every call. Disabled nodes are valid targets in every zone: `isDisabled` only prevents
 * dragging a node. `projection.clamped` is always `false` (the limit refuses a zone instead of
 * cutting the depth).
 */
export function getDropTarget<T>(
  flattened: readonly FlattenedNode<T>[],
  activeId: TreeId,
  overIndex: number,
  zone: DropZone,
  maxDepth?: number,
  subtreeHeight?: number,
): DropTarget | null {
  if (!Number.isInteger(overIndex)) return null;
  const activeIndex = flattened.findIndex((n) => n.id === activeId);
  const active = flattened[activeIndex];
  const over = flattened[overIndex];
  if (!active || !over || overIndex === activeIndex) return null;
  // Defensive: a row inside the dragged subtree (normally hidden while dragging).
  if (overIndex > activeIndex) {
    let end = activeIndex + 1;
    while (end < flattened.length && flattened[end]!.depth > active.depth) end++;
    if (overIndex < end) return null;
  }

  // The lower band of an expanded row with visible children is "first child" (the line shows
  // right below the row, next to the pointer); only collapsed rows and leaves get "next sibling".
  const next = flattened[overIndex + 1];
  const asFirstChild = zone === "after" && next !== undefined && next.depth > over.depth;
  const depth = zone === "inside" || asFirstChild ? over.depth + 1 : over.depth;
  if (maxDepth !== undefined) {
    const allowed = Math.max(0, maxDepth - (subtreeHeight ?? getSubtreeHeight(active.node)));
    if (depth > allowed) return null;
  }

  // Position of `row` among its siblings, not counting the dragged node.
  const position = (row: number, depthOfRow: number) => {
    let count = 0;
    for (let i = row - 1; i >= 0; i--) {
      const item = flattened[i]!;
      if (item.depth < depthOfRow) break;
      if (item.depth === depthOfRow && i !== activeIndex) count++;
    }
    return count;
  };

  let index: number;
  let slot: number;
  if (zone === "inside") {
    index = 0;
    slot = overIndex;
  } else if (zone === "before") {
    index = position(overIndex, over.depth);
    slot = overIndex;
  } else if (asFirstChild) {
    index = 0;
    slot = overIndex + 1;
  } else {
    index = position(overIndex, over.depth) + 1;
    slot = overIndex + 1;
  }

  const parentId = calculateNewParent(flattened, overIndex, asFirstChild ? "inside" : zone);
  let currentIndex = 0;
  for (let i = 0; i < activeIndex; i++) {
    const item = flattened[i]!;
    if (item.parentId === active.parentId && item.depth === active.depth) currentIndex++;
  }
  const isNoop = parentId === active.parentId && index === currentIndex;

  return {
    parentId,
    index,
    projection: { depth, minDepth: depth, maxDepth: depth, parentId, clamped: false, zone },
    slot,
    isNoop,
  };
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

/** Every id in the whole tree (not only the visible rows), in one O(n) pass. Internal. */
export function collectIds<T>(tree: TreeNode<T>[]): Set<TreeId> {
  const ids = new Set<TreeId>();
  const stack: TreeNode<T>[][] = [tree];
  while (stack.length > 0) {
    for (const n of stack.pop()!) {
      ids.add(n.id);
      if (n.children && n.children.length > 0) stack.push(n.children);
    }
  }
  return ids;
}

/** First node (document order) with the given id, or undefined. O(n). */
export function findFirstNode<T>(tree: TreeNode<T>[], id: TreeId): TreeNode<T> | undefined {
  const stack: TreeNode<T>[] = [];
  for (let i = tree.length - 1; i >= 0; i--) stack.push(tree[i]!);
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n.id === id) return n;
    if (n.children) for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]!);
  }
  return undefined;
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

/** Aggregate state of a node in checkbox mode: `true`, `false` or `"mixed"` (indeterminate). */
export type CheckState = boolean | "mixed";

export interface CheckStates {
  /** State of every node, in pre-order. Duplicate ids: the last occurrence wins. */
  states: Map<TreeId, CheckState>;
  /** Ids the user cannot change: disabled nodes and everything below them. */
  locked: Set<TreeId>;
  /** Ids whose state is derived from their children (their own id is never stored). */
  derived: Set<TreeId>;
}

/**
 * State of every node for a set of checked ids, computed on the WHOLE `data` (never on the
 * visible/filtered rows) in one O(n) post-order pass.
 *
 * - A node with at least one enabled child (and not itself locked) is derived from ALL its
 *   children, locked ones included: all `true` -> `true`, all `false` -> `false`, else `"mixed"`.
 *   Whether the parent id is in `checkedIds` does not matter.
 * - Any other node (a leaf, a locked node, or a parent whose children are all disabled) shows
 *   its own state: `true` iff its id is in `checkedIds`.
 */
export function getCheckStates<T>(
  data: TreeNode<T>[],
  checkedIds: ReadonlySet<TreeId>,
): CheckStates {
  const states = new Map<TreeId, CheckState>();
  const locked = new Set<TreeId>();
  const derived = new Set<TreeId>();
  const visit = (node: TreeNode<T>, isLocked: boolean): CheckState => {
    const nodeLocked = isLocked || !!node.isDisabled;
    if (nodeLocked) locked.add(node.id);
    // Placeholder first: Map keeps the insertion order, so the result is in pre-order.
    states.set(node.id, false);
    derived.delete(node.id);
    const children = node.children;
    let state: CheckState = checkedIds.has(node.id);
    if (children && children.length > 0) {
      let all = true;
      let none = true;
      let hasEnabledChild = false;
      for (const child of children) {
        if (!child.isDisabled) hasEnabledChild = true;
        const childState = visit(child, nodeLocked);
        if (childState !== true) all = false;
        if (childState !== false) none = false;
      }
      if (!nodeLocked && hasEnabledChild) {
        state = all ? true : none ? false : "mixed";
        derived.add(node.id);
      }
    }
    states.set(node.id, state);
    return state;
  };
  for (const root of data) visit(root, false);
  return { states, locked, derived };
}

/** Ids whose state is `true`, in tree (pre-)order. */
export function getCheckedIds(states: ReadonlyMap<TreeId, CheckState>): TreeId[] {
  const ids: TreeId[] = [];
  for (const [id, state] of states) if (state === true) ids.push(id);
  return ids;
}

/**
 * The checked ids after the user toggles `id`, or `null` when nothing can change (unknown id,
 * disabled node or node below a disabled one).
 *
 * The change cascades to the node and all its descendants, skipping every disabled node together
 * with its whole subtree. The direction is "check" unless every enabled node at the bottom of
 * that cascade is already checked ("uncheck"); this way a parent shown as `"mixed"` (because of
 * a disabled child) can never get stuck. The result lists, in tree order, only the nodes that
 * are `true` and whose state is not derived: leaves, locked nodes, and parents whose children
 * are all disabled. Parents with an enabled child are never listed (their state is computed from
 * the descendants), so the list stays valid when the tree is restructured; it can be passed back
 * as `checkedIds`. One O(n) pass for the lookup and the cascade plus one for the aggregate.
 *
 * With duplicate ids, the first occurrence in depth-first pre-order is the one toggled (even if
 * it is disabled: then nothing changes).
 */
export function toggleChecked<T>(
  data: TreeNode<T>[],
  checkedIds: ReadonlySet<TreeId>,
  id: TreeId,
): TreeId[] | null {
  // Explicit stack, pre-order: the first match in document order.
  let target: TreeNode<T> | undefined;
  let locked = false;
  const stack: Array<{ node: TreeNode<T>; locked: boolean }> = [];
  for (let i = data.length - 1; i >= 0; i--) stack.push({ node: data[i]!, locked: false });
  while (stack.length > 0) {
    const { node: n, locked: parentLocked } = stack.pop()!;
    const nodeLocked = parentLocked || !!n.isDisabled;
    if (n.id === id) {
      target = n;
      locked = nodeLocked;
      break;
    }
    const kids = n.children;
    if (kids) {
      for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i]!, locked: nodeLocked });
    }
  }
  if (!target || locked) return null;

  const cascade: TreeId[] = [];
  let allChecked = true;
  const walk: TreeNode<T>[] = [target];
  while (walk.length > 0) {
    const n = walk.pop()!;
    cascade.push(n.id);
    let hasEnabledChild = false;
    for (const child of n.children ?? []) {
      if (child.isDisabled) continue;
      hasEnabledChild = true;
      walk.push(child);
    }
    if (!hasEnabledChild && !checkedIds.has(n.id)) allChecked = false;
  }
  const next = new Set(checkedIds);
  for (const nodeId of cascade) {
    if (allChecked) next.delete(nodeId);
    else next.add(nodeId);
  }
  const { states, derived } = getCheckStates(data, next);
  return getCheckedIds(states).filter((checked) => !derived.has(checked));
}

/**
 * `ids` without those whose state is derived from their children (parents with an enabled
 * child): only leaves, locked nodes and parents whose children are all disabled keep their own
 * id. Internal helper for the uncontrolled state.
 */
export function withoutDerived<T>(data: TreeNode<T>[], ids: ReadonlySet<TreeId>): Set<TreeId> {
  if (ids.size === 0) return new Set(ids);
  const { derived } = getCheckStates(data, ids);
  const kept = new Set<TreeId>();
  for (const id of ids) if (!derived.has(id)) kept.add(id);
  return kept;
}

/**
 * Blank rows to keep while a dragged node's descendants are hidden. Only as many as the
 * scroll position at drag start needs (`scrollTop + viewport`), never more than the rows that
 * were hidden: keeping them all would leave a blank tail the auto-scroll could reach.
 */
export function getDragPaddingRows(
  rowCount: number,
  hiddenCount: number,
  scrollTop: number,
  viewport: number,
  rowHeight: number,
): number {
  if (hiddenCount <= 0 || !(rowHeight > 0)) return 0;
  const needed = Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewport)) / rowHeight);
  return Math.min(hiddenCount, Math.max(0, needed - rowCount));
}
