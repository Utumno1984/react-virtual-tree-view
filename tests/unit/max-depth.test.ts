import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";
import { flattenTree, getDropTarget, getSubtreeHeight, moveNode } from "../../src";
import { findNodeById, getTreeHeight } from "../../src/tree-utils";

const n = (id: string, children?: TreeNode[]): TreeNode => ({
  id,
  label: id,
  ...(children ? { children } : {}),
});

// p
//   A
//   B
//   C
//     C1
// q
// r
const tree = (): TreeNode[] => [n("p", [n("A"), n("B"), n("C", [n("C1")])]), n("q"), n("r")];
const flat = (t = tree()) => flattenTree(t, new Set(["p", "C"]));
const at = (id: string, f = flat()) => f.findIndex((x) => x.id === id);

/** Deepest node of a tree, root = 0. */
function treeDepth(nodes: TreeNode[], depth = 0): number {
  let max = nodes.length > 0 ? depth : -1;
  for (const node of nodes) max = Math.max(max, treeDepth(node.children ?? [], depth + 1));
  return max;
}

describe("findNodeById / getTreeHeight", () => {
  it("finds nested nodes, the first in pre-order for duplicates, undefined when missing", () => {
    const t = tree();
    expect(findNodeById(t, "C1")).toBe(t[0]!.children![2]!.children![0]);
    const first = n("x");
    expect(findNodeById([n("a", [first]), n("x")], "x")).toBe(first);
    expect(findNodeById(t, "nope")).toBeUndefined();
    expect(findNodeById([], "a")).toBeUndefined();
  });

  it("getTreeHeight: empty and flat trees are 0, otherwise the tallest root", () => {
    expect(getTreeHeight([])).toBe(0);
    expect(getTreeHeight([n("a"), n("b")])).toBe(0);
    expect(getTreeHeight(tree())).toBe(2);
  });
});

describe("getDropTarget with maxDepth", () => {
  it("a leaf dragged to a projected depth 3 with maxDepth 2 is cut to 2 and flagged", () => {
    const f = flat();
    const t = getDropTarget(f, "A", at("C1", f), 72, 24, 2)!;
    expect(t.projection.depth).toBe(2);
    expect(t.projection.clamped).toBe(true);
    expect(t.parentId).toBe("C");
  });

  it("a projection within the limit is not flagged, also exactly at the limit", () => {
    const f = flat();
    const t = getDropTarget(f, "A", at("C1", f), 24, 24, 2)!;
    expect(t.projection.depth).toBe(2);
    expect(t.projection.clamped).toBe(false);
  });

  it("a subtree of height 1 is cut to depth 1 with maxDepth 2", () => {
    const f = flat();
    // C (height 1) over B, 2 levels to the right: it would nest under A at depth 2
    const t = getDropTarget(f, "C", at("B", f), 48, 24, 2)!;
    expect(t.projection.depth).toBe(1);
    expect(t.projection.clamped).toBe(true);
  });

  it("a subtree taller than maxDepth stays at the minimum allowed depth, flagged, no exception", () => {
    const f = flat();
    // p has height 2; maxDepth 1 can never be respected: the neighbours' minimum wins
    const t = getDropTarget(f, "p", at("q", f), 0, 24, 1)!;
    expect(t.projection.depth).toBe(0);
    expect(t.projection.clamped).toBe(true);
    const moved = moveNode(tree(), "p", t.parentId, t.index);
    expect(moved.tree.map((x) => x.id)).toEqual(["q", "p", "r"]);
  });

  it("maxDepth 0 only allows moves among the roots", () => {
    const roots = flattenTree([n("a"), n("b"), n("c")], new Set<string>());
    // c over b: the slot is between a and b, where nesting under a would be possible
    const t = getDropTarget(roots, "c", 1, 200, 24, 0)!;
    expect(t.projection.depth).toBe(0);
    expect(t.projection.clamped).toBe(true);
    expect(t.parentId).toBeNull();
    expect(t.index).toBe(1);
  });

  it("without maxDepth there is no limit and never a clamp", () => {
    const f = flat();
    const t = getDropTarget(f, "A", at("C1", f), 72, 24)!;
    expect(t.projection.depth).toBe(3);
    expect(t.projection.clamped).toBe(false);
  });

  it("a disabled node as the destination does not exempt the cut", () => {
    const t = tree();
    t[0]!.children![2]!.children![0]!.isDisabled = true;
    const f = flat(t);
    const target = getDropTarget(f, "A", at("C1", f), 72, 24, 2)!;
    expect(target.projection.depth).toBe(2);
    expect(target.projection.clamped).toBe(true);
  });

  it("an empty tree and a single node do not throw", () => {
    expect(getDropTarget([], "a", 0, 0, 24, 2)).toBeNull();
    const single = flattenTree([n("a")], new Set<string>());
    const t = getDropTarget(single, "a", 0, 100, 24, 2)!;
    expect(t.projection.depth).toBe(0);
    expect(t.isNoop).toBe(true);
  });

  it("the dropped tree never exceeds maxDepth when it started within the limit", () => {
    for (const dx of [-100, -24, 0, 24, 48, 72, 200]) {
      for (const id of ["A", "B", "C", "q", "r"]) {
        // the dragged node's descendants are hidden while dragging
        const f = flat().filter((x) => x.id !== "C1" || id !== "C");
        for (let over = 0; over < f.length; over++) {
          const t = getDropTarget(f, id, over, dx, 24, 2);
          if (!t || t.isNoop) continue;
          const moved = moveNode(tree(), id, t.parentId, t.index);
          expect(treeDepth(moved.tree)).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("uses the precomputed subtreeHeight instead of recomputing it", () => {
    const f = flat();
    // C really has height 1; a (deliberately wrong) 0 proves the argument is what is used
    expect(getSubtreeHeight(tree()[0]!.children![2]!)).toBe(1);
    const lie = getDropTarget(f, "C", at("B", f), 48, 24, 2, 0)!;
    expect(lie.projection.depth).toBe(2);
    expect(lie.projection.clamped).toBe(false);
    const truth = getDropTarget(f, "C", at("B", f), 48, 24, 2, 1)!;
    expect(truth.projection.depth).toBe(1);
    expect(truth.projection.clamped).toBe(true);
  });
});
