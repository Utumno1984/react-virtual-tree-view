import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";
import {
  calculateNewParent,
  findDuplicateIds,
  flattenTree,
  getAncestorIds,
  getProjection,
  getSubtreeHeight,
  moveNode,
} from "../../src";
import { generateTree } from "../../stories/data/generateTree";

const n = (id: string | number, children?: TreeNode[], extra: Partial<TreeNode> = {}): TreeNode => ({
  id,
  label: String(id),
  ...(children ? { children } : {}),
  ...extra,
});

// a            depth 0
//   b          1
//     c        2
//   d          1
// e            0
//   f          1
// g            0
const sample = (): TreeNode[] => [
  n("a", [n("b", [n("c")]), n("d")]),
  n("e", [n("f")]),
  n("g"),
];
const ALL = ["a", "b", "c", "d", "e", "f", "g"];
const IND = 20;

function collectIds(nodes: TreeNode[], out: (string | number)[] = []) {
  for (const x of nodes) {
    out.push(x.id);
    if (x.children) collectIds(x.children, out);
  }
  return out;
}

describe("flattenTree", () => {
  it("returns [] for an empty tree", () => {
    expect(flattenTree([], new Set())).toEqual([]);
  });

  it("lists only roots when nothing is expanded", () => {
    const flat = flattenTree(sample(), new Set());
    expect(flat.map((f) => f.id)).toEqual(["a", "e", "g"]);
    expect(flat.map((f) => f.hasChildren)).toEqual([true, true, false]);
  });

  it("is pre-order with depth, parentId, index and hasChildren", () => {
    const flat = flattenTree(sample(), new Set(ALL));
    expect(flat.map((f) => [f.id, f.depth, f.parentId, f.index, f.hasChildren])).toEqual([
      ["a", 0, null, 0, true],
      ["b", 1, "a", 1, true],
      ["c", 2, "b", 2, false],
      ["d", 1, "a", 3, false],
      ["e", 0, null, 4, true],
      ["f", 1, "e", 5, false],
      ["g", 0, null, 6, false],
    ]);
    expect(flat[0]!.node.id).toBe("a");
  });

  it("includes only children of expanded nodes (not of collapsed descendants)", () => {
    const flat = flattenTree(sample(), new Set(["a"]));
    expect(flat.map((f) => f.id)).toEqual(["a", "b", "d", "e", "g"]);
  });

  it("accepts an array of ids and numeric ids", () => {
    const flat = flattenTree([n(1, [n(2)])], [1]);
    expect(flat.map((f) => f.id)).toEqual([1, 2]);
  });

  it("handles a single node and an empty children array", () => {
    const flat = flattenTree([n("x", [])], new Set(["x"]));
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({ depth: 0, parentId: null, hasChildren: false });
  });
});

describe("getSubtreeHeight", () => {
  it("is 0 for a leaf and 1 for a node with a single leaf child", () => {
    expect(getSubtreeHeight(n("x"))).toBe(0);
    expect(getSubtreeHeight(n("x", []))).toBe(0);
    expect(getSubtreeHeight(n("x", [n("y")]))).toBe(1);
  });

  it("takes the deepest branch", () => {
    expect(getSubtreeHeight(sample()[0]!)).toBe(2);
  });
});

describe("getProjection", () => {
  const flat = () => flattenTree(sample(), new Set(ALL));

  it("keeps the depth with no horizontal offset", () => {
    expect(getProjection(flat(), "g", "g", 0, IND)).toMatchObject({
      depth: 0,
      parentId: null,
      clamped: false,
    });
  });

  it("indents by round(dx / indentation), limited by the previous node", () => {
    expect(getProjection(flat(), "g", "g", IND, IND)).toMatchObject({
      depth: 1,
      parentId: "e",
      maxDepth: 2,
      minDepth: 0,
    });
    expect(getProjection(flat(), "g", "g", 2 * IND, IND)).toMatchObject({ depth: 2, parentId: "f" });
    expect(getProjection(flat(), "g", "g", 10 * IND, IND)).toMatchObject({ depth: 2, parentId: "f" });
    expect(getProjection(flat(), "g", "g", 0.4 * IND, IND)!.depth).toBe(0);
    expect(getProjection(flat(), "g", "g", 0.6 * IND, IND)!.depth).toBe(1);
  });

  it("cannot go below the minimum imposed by the next node", () => {
    // moving "g" over "c": it lands before "c" (depth 2)
    const p = getProjection(flat(), "g", "c", -5 * IND, IND)!;
    expect(p.minDepth).toBe(2);
    expect(p.depth).toBe(2);
    expect(p.parentId).toBe("b");
  });

  it("excludes the descendants of the active node", () => {
    // "a" dropped over "e": lands between e and f, so it must nest under e
    const p = getProjection(flat(), "a", "e", 0, IND)!;
    expect(p).toMatchObject({ depth: 1, minDepth: 1, maxDepth: 1, parentId: "e" });
  });

  it("returns null for unknown ids", () => {
    expect(getProjection(flat(), "zzz", "g", 0, IND)).toBeNull();
    expect(getProjection(flat(), "g", "zzz", 0, IND)).toBeNull();
    expect(getProjection([], "g", "g", 0, IND)).toBeNull();
  });

  it("single node: never deeper than 0", () => {
    const f = flattenTree([n("x")], new Set());
    expect(getProjection(f, "x", "x", 5 * IND, IND)).toMatchObject({ depth: 0, parentId: null });
  });

  it("has no limit and clamped=false without maxDepth", () => {
    const p = getProjection(flat(), "g", "g", 2 * IND, IND, undefined)!;
    expect(p.clamped).toBe(false);
    expect(p.depth).toBe(2);
  });

  it("does not flag clamped when within maxDepth", () => {
    const p = getProjection(flat(), "g", "g", 2 * IND, IND, 2)!;
    expect(p).toMatchObject({ depth: 2, clamped: false });
  });

  it("clamps to maxDepth - height and flags it", () => {
    const p = getProjection(flat(), "g", "g", 2 * IND, IND, 1)!;
    expect(p).toMatchObject({ depth: 1, clamped: true, maxDepth: 1, parentId: "e" });
  });

  it("maxDepth 0 forces everything to the root", () => {
    const p = getProjection(flat(), "g", "g", 3 * IND, IND, 0)!;
    expect(p).toMatchObject({ depth: 0, clamped: true, parentId: null });
  });

  it("counts the height of the dragged subtree", () => {
    // "e" has height 1: with maxDepth 1 it can only sit at depth 0
    const p = getProjection(flat(), "e", "e", IND, IND, 1)!;
    expect(p.depth).toBe(0);
    // projected depth 1 + height 1 = 2 > 1
    expect(p.clamped).toBe(true);
    // same drag with maxDepth 2 is fine
    expect(getProjection(flat(), "e", "e", IND, IND, 2)!).toMatchObject({ depth: 1, clamped: false });
  });

  it("subtree taller than maxDepth: depth stays at the minimum, clamped, not rejected", () => {
    // "a" has height 2, maxDepth 1 -> maxDepth - h = -1
    const p = getProjection(flat(), "a", "a", 0, IND, 1)!;
    expect(p).toMatchObject({ depth: 0, clamped: true, parentId: null });
  });

  it("when maxDepth - h is below the minimum, depth stays at the minimum", () => {
    // "g" over "c" needs depth >= 2, but maxDepth 1 allows at most 1
    const p = getProjection(flat(), "g", "c", 0, IND, 1)!;
    expect(p).toMatchObject({ depth: 2, minDepth: 2, clamped: true });
  });

  it("non-conforming initial data: a drop just above a row already deeper than maxDepth is flagged clamped, the slot is not moved past it (known limit, #26)", () => {
    // a > b > c > [d, e] is depth 3 with maxDepth 2; "l" is dropped between d and e.
    const deep = flattenTree([n("a", [n("b", [n("c", [n("d"), n("e")])])]), n("l")], new Set(["a", "b", "c"]));
    const p = getProjection(deep, "l", "e", 0, IND, 2)!;
    // The row below ("e") is already deeper than maxDepth, so the slot is not moved past it
    // and depth 3 > maxDepth. `clamped` is true but is also true for ordinary cuts; the
    // overshoot is detected with depth + subtree height > maxDepth (here 3 + 0 > 2).
    expect(p).toMatchObject({ depth: 3, minDepth: 3, parentId: "c", clamped: true });
  });

  it("does not treat disabled nodes differently", () => {
    const tree = [n("a", [], { isDisabled: true }), n("b")];
    const f = flattenTree(tree, new Set());
    expect(getProjection(f, "b", "b", IND, IND)).toMatchObject({ depth: 1, parentId: "a" });
  });
});

describe("calculateNewParent", () => {
  const flat = flattenTree(sample(), new Set(ALL));

  it("returns null for depth 0 and for the first position", () => {
    expect(calculateNewParent(flat, 3, 0)).toBeNull();
    expect(calculateNewParent(flat, 0, 2)).toBeNull();
  });

  it("returns the previous node when going deeper", () => {
    expect(calculateNewParent(flat, 3, 3)).toBe("c");
    expect(calculateNewParent(flat, 6, 1)).toBe("e");
  });

  it("returns the previous parent at the same depth", () => {
    expect(calculateNewParent(flat, 3, 2)).toBe("b");
  });

  it("looks back for the closest node at the requested depth", () => {
    // before index 4 ("e"): c(2) d(1) -> depth 1 parent is "a"
    expect(calculateNewParent(flat, 4, 1)).toBe("a");
    expect(calculateNewParent(flat, 4, 0)).toBeNull();
  });
});

describe("findDuplicateIds", () => {
  it("is empty without duplicates", () => {
    expect(findDuplicateIds(sample())).toEqual([]);
    expect(findDuplicateIds([])).toEqual([]);
  });

  it("reports repeated ids once, at any depth", () => {
    const tree = [n("a", [n("x"), n("x")]), n("x"), n(1), n(1), n("1")];
    expect(findDuplicateIds(tree).sort()).toEqual([1, "x"]);
  });

  it("other helpers do not throw with duplicate ids", () => {
    const tree = [n("a", [n("a")]), n("a")];
    expect(() => flattenTree(tree, new Set(["a"]))).not.toThrow();
    expect(() => moveNode(tree, "a", "a", 0)).not.toThrow();
    expect(() => getAncestorIds(tree, "a")).not.toThrow();
    expect(() => getProjection(flattenTree(tree, new Set(["a"])), "a", "a", 0, IND)).not.toThrow();
  });
});

describe("getAncestorIds", () => {
  it("goes from the root to the parent", () => {
    expect(getAncestorIds(sample(), "c")).toEqual(["a", "b"]);
    expect(getAncestorIds(sample(), "f")).toEqual(["e"]);
  });

  it("is empty for roots and unknown ids", () => {
    expect(getAncestorIds(sample(), "a")).toEqual([]);
    expect(getAncestorIds(sample(), "nope")).toEqual([]);
    expect(getAncestorIds([], "a")).toEqual([]);
  });
});

describe("moveNode", () => {
  it("moves a node with its subtree and leaves the original untouched", () => {
    const tree = sample();
    const copy = structuredClone(tree);
    const res = moveNode(tree, "b", "e", 0);
    expect(tree).toEqual(copy);
    expect(res.fromParentId).toBe("a");
    expect(res.toParentId).toBe("e");
    expect(res.index).toBe(0);
    expect(res.tree[0]!.children!.map((x) => x.id)).toEqual(["d"]);
    expect(res.tree[1]!.children!.map((x) => x.id)).toEqual(["b", "f"]);
    expect(res.tree[1]!.children![0]!.children!.map((x) => x.id)).toEqual(["c"]);
  });

  it("shares untouched branches structurally", () => {
    const tree = sample();
    const res = moveNode(tree, "g", "a", 1);
    expect(res.tree[1]).toBe(tree[1]!);
    expect(res.tree[0]!.children!.map((x) => x.id)).toEqual(["b", "g", "d"]);
  });

  it("reorders inside the same parent (index after removal)", () => {
    const res = moveNode(sample(), "b", "a", 1);
    expect(res.tree[0]!.children!.map((x) => x.id)).toEqual(["d", "b"]);
    expect(res.fromParentId).toBe("a");
    expect(res.toParentId).toBe("a");
    expect(res.index).toBe(1);
  });

  it("moves to the root level with null and clamps the index", () => {
    const res = moveNode(sample(), "c", null, 99);
    expect(res.tree.map((x) => x.id)).toEqual(["a", "e", "g", "c"]);
    expect(res.index).toBe(3);
    expect(res.tree[0]!.children![0]!.children).toEqual([]);
    expect(moveNode(sample(), "c", null, -4).tree[0]!.id).toBe("c");
  });

  it("can move into a leaf and into a disabled node", () => {
    const res = moveNode(sample(), "a", "g", 0);
    expect(res.tree.map((x) => x.id)).toEqual(["e", "g"]);
    expect(res.tree[1]!.children!.map((x) => x.id)).toEqual(["a"]);
    const tree = [n("p", [], { isDisabled: true }), n("q")];
    expect(moveNode(tree, "q", "p", 0).tree[0]!.children!.map((x) => x.id)).toEqual(["q"]);
  });

  it("returns the same reference when the target is the node or a descendant", () => {
    const tree = sample();
    expect(moveNode(tree, "a", "a", 0).tree).toBe(tree);
    expect(moveNode(tree, "a", "b", 0).tree).toBe(tree);
    expect(moveNode(tree, "a", "c", 0).tree).toBe(tree);
  });

  it("returns the same reference for unknown ids and empty trees", () => {
    const tree = sample();
    expect(moveNode(tree, "nope", "a", 0).tree).toBe(tree);
    expect(moveNode(tree, "a", "nope", 0).tree).toBe(tree);
    const empty: TreeNode[] = [];
    expect(moveNode(empty, "a", null, 0).tree).toBe(empty);
  });
});

describe("integration and performance", () => {
  it("moveNode on a 1000 node tree keeps every node and updates depths", () => {
    const tree = generateTree({ count: 1000, maxDepth: 5, seed: 42 });
    const all = new Set(collectIds(tree));
    const before = flattenTree(tree, all);
    expect(before).toHaveLength(1000);
    const target = tree[0]!.id;
    const moved = before.find(
      (f) =>
        f.hasChildren &&
        f.id !== target &&
        !getAncestorIds(tree, f.id).includes(target) &&
        f.parentId !== target,
    )!;
    expect(moved).toBeDefined();
    const subtreeSize = collectIds([moved.node]).length;

    const res = moveNode(tree, moved.id, target, 0);
    const after = flattenTree(res.tree, all);
    expect(after).toHaveLength(1000);
    expect(new Set(after.map((f) => f.id)).size).toBe(1000);
    expect(findDuplicateIds(res.tree)).toEqual([]);

    const targetPos = after.findIndex((f) => f.id === target);
    expect(after[targetPos + 1]!.id).toBe(moved.id);
    const newDepth = after[targetPos]!.depth + 1;
    expect(after[targetPos + 1]!.depth).toBe(newDepth);
    const oldById = new Map(before.map((f) => [f.id, f]));
    for (let i = 0; i < subtreeSize; i++) {
      const f = after[targetPos + 1 + i]!;
      expect(f.depth - newDepth).toBe(oldById.get(f.id)!.depth - moved.depth);
    }
    // the original is untouched
    expect(flattenTree(tree, all)).toEqual(before);
  });

  it("flattenTree and getProjection on 5000 nodes stay under 500 ms (documented budget)", () => {
    const tree = generateTree({ count: 5000, maxDepth: 6, seed: 7 });
    const all = new Set(collectIds(tree));
    const start = performance.now();
    const flat = flattenTree(tree, all);
    const last = flat[flat.length - 1]!;
    const first = flat[0]!;
    for (let i = 0; i < 20; i++) getProjection(flat, last.id, first.id, IND, IND, 6);
    const elapsed = performance.now() - start;
    expect(flat).toHaveLength(5000);
    expect(elapsed).toBeLessThan(500);
  });
});
