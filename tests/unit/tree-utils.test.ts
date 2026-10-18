import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";
import {
  calculateNewParent,
  findDuplicateIds,
  flattenTree,
  getAncestorIds,
  getDropZone,
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

  // The horizontal-offset tests of the previous model (indent by round(dx / indentation),
  // neighbour-limited depth, slot skipping and the "known limit" overshoot cases) are replaced by
  // zone tests: the depth is now fully determined by the hovered row and the zone (#63).
  it("before: sibling of the hovered row, same depth and parent", () => {
    expect(getProjection(flat(), "g", "d", "before")).toMatchObject({
      depth: 1,
      parentId: "a",
      zone: "before",
      clamped: false,
    });
    expect(getProjection(flat(), "g", "c", "before")).toMatchObject({ depth: 2, parentId: "b" });
  });

  it("after: sibling of the hovered leaf, same depth and parent", () => {
    expect(getProjection(flat(), "g", "d", "after")).toMatchObject({ depth: 1, parentId: "a" });
    expect(getProjection(flat(), "c", "g", "after")).toMatchObject({ depth: 0, parentId: null });
  });

  it("after on an expanded row with visible children: first child of that row", () => {
    expect(getProjection(flat(), "g", "b", "after")).toMatchObject({ depth: 2, parentId: "b" });
    expect(getProjection(flat(), "c", "e", "after")).toMatchObject({ depth: 1, parentId: "e" });
  });

  it("inside: child of the hovered row, one level deeper", () => {
    expect(getProjection(flat(), "g", "e", "inside")).toMatchObject({ depth: 1, parentId: "e" });
    expect(getProjection(flat(), "a", "g", "inside")).toMatchObject({ depth: 1, parentId: "g" });
    // minDepth / maxDepth are kept for compatibility and equal to the depth
    expect(getProjection(flat(), "g", "c", "inside")).toMatchObject({
      depth: 3,
      minDepth: 3,
      maxDepth: 3,
      parentId: "c",
    });
  });

  it("returns null for unknown ids, the dragged node itself and its descendants", () => {
    expect(getProjection(flat(), "zzz", "g", "before")).toBeNull();
    expect(getProjection(flat(), "g", "zzz", "before")).toBeNull();
    expect(getProjection([], "g", "g", "before")).toBeNull();
    expect(getProjection(flat(), "g", "g", "inside")).toBeNull();
    // "b" and "c" belong to the dragged subtree of "a"
    expect(getProjection(flat(), "a", "b", "inside")).toBeNull();
    expect(getProjection(flat(), "a", "c", "after")).toBeNull();
  });

  it("has no limit and clamped=false without maxDepth", () => {
    const p = getProjection(flat(), "g", "c", "inside", undefined)!;
    expect(p.clamped).toBe(false);
    expect(p.depth).toBe(3);
  });

  it("with maxDepth: inside needs row.depth + 1 + height <= maxDepth", () => {
    expect(getProjection(flat(), "g", "f", "inside", 2)).toMatchObject({ depth: 2, parentId: "f" });
    expect(getProjection(flat(), "g", "f", "inside", 1)).toBeNull();
    // maxDepth 0: nothing can become a child
    expect(getProjection(flat(), "g", "e", "inside", 0)).toBeNull();
  });

  it("with maxDepth: before / after need row.depth + height <= maxDepth", () => {
    // sibling of "c" (depth 2) is valid with maxDepth 2, not with 1
    expect(getProjection(flat(), "g", "c", "before", 2)).toMatchObject({ depth: 2 });
    expect(getProjection(flat(), "g", "c", "after", 1)).toBeNull();
    // a root sibling is always valid, even with maxDepth 0
    expect(getProjection(flat(), "c", "g", "after", 0)).toMatchObject({ depth: 0, parentId: null });
  });

  it("counts the height of the dragged subtree", () => {
    // "e" has height 1: with maxDepth 1 it can be a sibling of a root, not a child of one
    expect(getProjection(flat(), "e", "g", "after", 1)).toMatchObject({ depth: 0 });
    expect(getProjection(flat(), "e", "g", "inside", 1)).toBeNull();
    // with maxDepth 2 the child zone is fine
    expect(getProjection(flat(), "e", "g", "inside", 2)).toMatchObject({ depth: 1, parentId: "g" });
    // sibling of a depth-1 row would put "f" under "e"'s level 2: refused with maxDepth 1
    expect(getProjection(flat(), "e", "d", "before", 1)).toBeNull();
  });

  it("subtree taller than maxDepth: only the root level stays valid", () => {
    // "a" has height 2, maxDepth 1 -> allowed depth max(0, -1) = 0
    expect(getProjection(flat(), "a", "g", "after", 1)).toMatchObject({ depth: 0, parentId: null });
    expect(getProjection(flat(), "a", "g", "inside", 1)).toBeNull();
  });

  it("does not treat disabled nodes differently: they accept children and siblings", () => {
    const tree = [n("a", [], { isDisabled: true }), n("b")];
    const f = flattenTree(tree, new Set());
    expect(getProjection(f, "b", "a", "inside")).toMatchObject({ depth: 1, parentId: "a" });
    expect(getProjection(f, "b", "a", "before")).toMatchObject({ depth: 0, parentId: null });
  });
});

describe("getDropZone", () => {
  it("splits a row into 25% / 50% / 25% bands", () => {
    expect(getDropZone(0)).toBe("before");
    expect(getDropZone(0.24)).toBe("before");
    expect(getDropZone(0.25)).toBe("inside");
    expect(getDropZone(0.5)).toBe("inside");
    expect(getDropZone(0.74)).toBe("inside");
    expect(getDropZone(0.75)).toBe("after");
    expect(getDropZone(0.99)).toBe("after");
  });

  it("treats positions outside the row as the nearest band", () => {
    expect(getDropZone(-3)).toBe("before");
    expect(getDropZone(7)).toBe("after");
  });
});

describe("calculateNewParent", () => {
  const flat = flattenTree(sample(), new Set(ALL));

  it("is the row itself for inside", () => {
    expect(calculateNewParent(flat, 0, "inside")).toBe("a");
    expect(calculateNewParent(flat, 2, "inside")).toBe("c");
  });

  it("is the row's own parent for before and after (null at the root)", () => {
    expect(calculateNewParent(flat, 2, "before")).toBe("b");
    expect(calculateNewParent(flat, 3, "after")).toBe("a");
    expect(calculateNewParent(flat, 0, "before")).toBeNull();
    expect(calculateNewParent(flat, 6, "after")).toBeNull();
  });

  it("is null for an out-of-range row", () => {
    expect(calculateNewParent(flat, 99, "inside")).toBeNull();
    expect(calculateNewParent(flat, -1, "before")).toBeNull();
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
    expect(() => getProjection(flattenTree(tree, new Set(["a"])), "a", "a", "before")).not.toThrow();
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
    for (let i = 0; i < 20; i++) getProjection(flat, last.id, first.id, "inside", 6);
    const elapsed = performance.now() - start;
    expect(flat).toHaveLength(5000);
    expect(elapsed).toBeLessThan(500);
  });
});
