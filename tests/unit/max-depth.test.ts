import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";
import { flattenTree, getDropTarget, getSubtreeHeight, moveNode } from "../../src";
import type { DropZone } from "../../src";
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
const ZONES: DropZone[] = ["before", "inside", "after"];

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

// The tests below replace the ones of the horizontal-offset model (#63): `maxDepth` no longer
// cuts a projected depth (`clamped`), it makes a zone an invalid target (`null`).
describe("getDropTarget with maxDepth", () => {
  it("child of a row is refused when it would exceed the limit, exactly at the limit is fine", () => {
    const f = flat();
    // C1 is at depth 2: a child of it would be at depth 3 (> 2); a child of C (depth 1) is at 2
    expect(getDropTarget(f, "A", at("C1", f), "inside", 2)).toBeNull();
    const ok = getDropTarget(f, "A", at("C", f), "inside", 2)!;
    expect(ok.projection).toMatchObject({ depth: 2, clamped: false, zone: "inside" });
    expect(ok.parentId).toBe("C");
  });

  it("the sibling zones of the same row stay valid when they fit", () => {
    const f = flat();
    for (const zone of ["before", "after"] as const) {
      const t = getDropTarget(f, "A", at("C1", f), zone, 2)!;
      expect(t.projection.depth).toBe(2);
      expect(t.parentId).toBe("C");
    }
  });

  it("a subtree of height 1 needs one more level than a leaf", () => {
    const f = flat();
    // C (height 1) with maxDepth 2: child of B would be at depth 2 -> its child at 3: refused
    expect(getDropTarget(f, "C", at("B", f), "inside", 2)).toBeNull();
    // sibling of B (depth 1): C at 1, C1 at 2: fine
    expect(getDropTarget(f, "C", at("B", f), "before", 2)).not.toBeNull();
    // sibling of C1 (depth 2): C at 2, its child at 3: refused
    expect(getDropTarget(f, "C", at("C1", f), "after", 2)).toBeNull();
  });

  it("a subtree taller than maxDepth is only accepted at the root level, no exception", () => {
    const f = flat();
    // p has height 2; maxDepth 1 can never be respected: the shallowest depth (0) is the one left
    const t = getDropTarget(f, "p", at("q", f), "after", 1)!;
    expect(t.projection.depth).toBe(0);
    const moved = moveNode(tree(), "p", t.parentId, t.index);
    expect(moved.tree.map((x) => x.id)).toEqual(["q", "p", "r"]);
    expect(getDropTarget(f, "p", at("q", f), "inside", 1)).toBeNull();
  });

  it("maxDepth 0 only allows moves among the roots", () => {
    const roots = flattenTree([n("a"), n("b"), n("c")], new Set<string>());
    expect(getDropTarget(roots, "c", 1, "inside", 0)).toBeNull();
    const t = getDropTarget(roots, "c", 1, "before", 0)!;
    expect(t.projection.depth).toBe(0);
    expect(t.parentId).toBeNull();
    expect(t.index).toBe(1);
  });

  it("without maxDepth there is no limit and never a clamp", () => {
    const f = flat();
    const t = getDropTarget(f, "A", at("C1", f), "inside")!;
    expect(t.projection.depth).toBe(3);
    expect(t.projection.clamped).toBe(false);
  });

  it("a disabled node as the destination does not exempt the limit", () => {
    const t = tree();
    t[0]!.children![2]!.children![0]!.isDisabled = true;
    const f = flat(t);
    expect(getDropTarget(f, "A", at("C1", f), "inside", 2)).toBeNull();
    expect(getDropTarget(f, "A", at("C1", f), "before", 2)).not.toBeNull();
  });

  it("an empty tree and a single node do not throw", () => {
    expect(getDropTarget([], "a", 0, "before", 2)).toBeNull();
    const single = flattenTree([n("a")], new Set<string>());
    expect(getDropTarget(single, "a", 0, "inside", 2)).toBeNull();
  });

  it("the dropped tree never exceeds maxDepth when it started within the limit", () => {
    for (const zone of ZONES) {
      for (const id of ["A", "B", "C", "q", "r"]) {
        // the dragged node's descendants are hidden while dragging
        const f = flat().filter((x) => x.id !== "C1" || id !== "C");
        for (let over = 0; over < f.length; over++) {
          const t = getDropTarget(f, id, over, zone, 2);
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
    expect(getDropTarget(f, "C", at("B", f), "inside", 2, 0)).not.toBeNull();
    expect(getDropTarget(f, "C", at("B", f), "inside", 2, 1)).toBeNull();
  });
});

describe("getDropTarget with maxDepth: rows already at the limit", () => {
  // a
  // b
  //   c
  //     c1      <- deepest conforming level (maxDepth 2)
  // docs (height 1, collapsed while dragged)
  //   cv
  const t = (): TreeNode[] => [n("a"), n("b", [n("c", [n("c1")])]), n("docs", [n("cv")])];
  const f = () => flattenTree(t(), new Set(["b", "c"]));

  it("there is no slot at the depth of c1 for a node of height 1: the zones around c1 are refused", () => {
    const rows = f();
    // docs (height 1) next to c1 (depth 2) would sit at depth 2 -> cv at 3 > 2
    expect(getDropTarget(rows, "docs", at("c1", rows), "before", 2, 1)).toBeNull();
    expect(getDropTarget(rows, "docs", at("c1", rows), "after", 2, 1)).toBeNull();
    // next to c (depth 1) it fits, and the slot is just above/below c's row (below c1 for after)
    const before = getDropTarget(rows, "docs", at("c", rows), "before", 2, 1)!;
    expect(before.slot).toBe(at("c", rows));
    expect(before.projection.depth).toBe(1);
    const after = getDropTarget(rows, "docs", at("c", rows), "after", 2, 1)!;
    expect(after.slot).toBe(at("c1", rows) + 1);
  });

  it("without maxDepth every zone is available", () => {
    const rows = f();
    const target = getDropTarget(rows, "docs", at("c1", rows), "before")!;
    expect(target.slot).toBe(at("c1", rows));
    expect(target.projection.clamped).toBe(false);
  });
});
