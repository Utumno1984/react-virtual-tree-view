import { describe, expect, it, vi } from "vitest";
import type { TreeNode } from "../../src";
import { flattenTree, getDropTarget, moveNode } from "../../src";
import { createProjectionCache } from "../../src/projection-cache";

const n = (id: string, children?: TreeNode[], isDisabled?: boolean): TreeNode => ({
  id,
  label: id,
  ...(children ? { children } : {}),
  ...(isDisabled ? { isDisabled } : {}),
});

// p
//   A
//   B
//   C
//     c1
//   D
// q
const tree = (): TreeNode[] => [n("p", [n("A"), n("B"), n("C", [n("c1")]), n("D")]), n("q")];
const IND = 24;

function target(
  t: TreeNode[],
  expanded: string[],
  activeId: string,
  overId: string,
  dx: number,
  hideActiveChildren = true,
) {
  const open = new Set(expanded);
  if (hideActiveChildren) open.delete(activeId);
  const flat = flattenTree(t, open);
  return getDropTarget(
    flat,
    activeId,
    flat.findIndex((x) => x.id === overId),
    dx,
    IND,
  );
}
const open = ["p", "C"];

describe("getDropTarget", () => {
  it("dragging B one indentation right nests it as last child of A", () => {
    const r = target(tree(), open, "B", "B", IND)!;
    expect(r.parentId).toBe("A");
    expect(r.index).toBe(0);
    expect(r.projection.depth).toBe(2);
    expect(r.isNoop).toBe(false);
    const moved = moveNode(tree(), "B", r.parentId, r.index);
    expect(moved.toParentId).toBe("A");
    expect(moved.fromParentId).toBe("p");
  });

  it("nests after the existing children of an expanded previous row", () => {
    // D right: previous row is c1 (depth 2, child of C), so depth 2 means child of C
    const r = target(tree(), open, "D", "D", IND)!;
    expect(r.parentId).toBe("C");
    expect(r.index).toBe(1);
  });

  it("dragging the last child left by one indentation makes it the next sibling of its parent", () => {
    const t: TreeNode[] = [n("A", [n("C")]), n("B")];
    const r = target(t, ["A"], "C", "C", -IND)!;
    expect(r.parentId).toBeNull();
    expect(r.index).toBe(1);
    expect(r.projection.depth).toBe(0);
    expect(r.isNoop).toBe(false);
  });

  it("clamps the depth to what the neighbours allow (no skipped levels)", () => {
    const r = target(tree(), open, "B", "B", IND * 5)!;
    expect(r.projection.depth).toBe(2); // previous (A) depth 1 + 1
    expect(r.projection.maxDepth).toBe(2);
    const left = target(tree(), open, "B", "B", -IND * 5)!;
    // next row C is at depth 1: cannot go shallower than it
    expect(left.projection.depth).toBe(1);
    expect(left.projection.minDepth).toBe(1);
  });

  it("the first node always projects to depth 0", () => {
    const r = target(tree(), open, "p", "p", IND * 3)!;
    expect(r.projection.depth).toBe(0);
    expect(r.isNoop).toBe(true);
  });

  it("a single node cannot nest and an empty list gives null", () => {
    const only = [n("X")];
    const r = target(only, [], "X", "X", IND * 2)!;
    expect(r.projection.depth).toBe(0);
    expect(r.isNoop).toBe(true);
    expect(getDropTarget([], "X", 0, 0, IND)).toBeNull();
  });

  it("the dragged node's descendants cannot receive it (they are not in the list)", () => {
    // C is dragged with its child hidden: dropping "on" the row after C never lands inside c1
    const r = target(tree(), open, "C", "D", IND)!;
    expect(r.parentId).not.toBe("c1");
    const flat = flattenTree(tree(), new Set(["p"]));
    expect(flat.map((x) => x.id)).not.toContain("c1");
    // and moveNode refuses a move into a descendant anyway
    const bad = moveNode(tree(), "C", "c1", 0);
    expect(bad.tree).toEqual(tree());
  });

  it("a disabled node can receive children", () => {
    const t: TreeNode[] = [n("A", undefined, true), n("B")];
    const r = target(t, [], "B", "B", IND)!;
    expect(r.parentId).toBe("A");
    expect(moveNode(t, "B", r.parentId, r.index).tree[0]!.children).toEqual([n("B")]);
  });

  it("nesting under a collapsed parent appends after its hidden children", () => {
    const t: TreeNode[] = [n("A", [n("a1"), n("a2")]), n("B")];
    const r = target(t, [], "B", "B", IND)!;
    expect(r.parentId).toBe("A");
    expect(r.index).toBe(2);
  });

  it("moving a subtree to another level moves the descendants with it", () => {
    const r = target(tree(), open, "C", "C", -IND)!;
    // C is followed by D (depth 1): cannot go to depth 0 here
    expect(r.projection.depth).toBe(1);
    const t: TreeNode[] = [n("A"), n("C", [n("c1", [n("c2")])])];
    const nested = target(t, ["C", "c1"], "C", "C", IND)!;
    expect(nested.parentId).toBe("A");
    const result = moveNode(t, "C", nested.parentId, nested.index).tree;
    const flat = flattenTree(result, new Set(["A", "C", "c1"]));
    expect(flat.map((x) => [x.id, x.depth])).toEqual([
      ["A", 0],
      ["C", 1],
      ["c1", 2],
      ["c2", 3],
    ]);
  });

  it("dropping in the original place is a no-op", () => {
    expect(target(tree(), open, "B", "B", 0)!.isNoop).toBe(true);
    expect(target(tree(), open, "B", "B", 4)!.isNoop).toBe(true);
  });

  it("reordering still works: A over C drops after C's subtree", () => {
    const r = target(tree(), open, "A", "C", 0)!;
    expect(r).toMatchObject({ parentId: "p", index: 2, isNoop: false });
  });

  it("a row deeper than the dragged node counts as its ancestor sibling", () => {
    const r = target(tree(), open, "A", "c1", 0)!;
    expect(r).toMatchObject({ parentId: "p", index: 2 });
  });

  it("two drags over the same row give different targets for different dragged nodes", () => {
    // tree: C1 is C's only child; drag C1 over B, then B over B (same row and steps)
    const t: TreeNode[] = [n("p", [n("A"), n("B"), n("C", [n("C1")])])];
    const first = target(t, ["p", "C"], "C1", "B", 0)!;
    const second = target(t, ["p", "C"], "B", "B", 0)!;
    expect(first.isNoop).toBe(false);
    expect(first.parentId).toBe("A"); // before B at C1's depth: last child of A
    expect(second.isNoop).toBe(true);
  });

  it("an only child dropped in place is a no-op (dx 0)", () => {
    const t: TreeNode[] = [n("p", [n("A"), n("C", [n("C1")]), n("D")])];
    const r = target(t, ["p", "C"], "C1", "C1", 0)!;
    expect(r).toMatchObject({ parentId: "C", index: 0, isNoop: true });
    // last child of several: also a no-op
    const t2: TreeNode[] = [n("p", [n("C", [n("c1"), n("c2")]), n("D")])];
    expect(target(t2, ["p", "C"], "c2", "c2", 0)!.isNoop).toBe(true);
    expect(target(t2, ["p", "C"], "c1", "c1", 0)!.isNoop).toBe(true);
  });

  // r
  //   p
  //     A
  //   docs
  //     cv
  //     notes
  //   misc
  const docsTree = (): TreeNode[] => [
    n("p", [n("A")]),
    n("docs", [n("cv"), n("notes")]),
    n("misc"),
  ];
  const docsOpen = ["p", "docs"];

  it("a root dragged up over a child lands between that parent's children", () => {
    const r = target(docsTree(), docsOpen, "misc", "notes", 0)!;
    expect(r).toMatchObject({ parentId: "docs", index: 1, isNoop: false });
    expect(r.projection.depth).toBe(1);
  });

  it("a root dragged up over the first child of an open node becomes its first child", () => {
    const r = target(docsTree(), docsOpen, "misc", "cv", 0)!;
    expect(r).toMatchObject({ parentId: "docs", index: 0 });
    // over A, first child of p: the same, whatever the horizontal offset
    for (const dx of [0, IND, -IND * 3]) {
      expect(target(docsTree(), docsOpen, "misc", "A", dx)!).toMatchObject({ parentId: "p", index: 0 });
    }
  });

  it("a root dragged down over a child lands after it, inside its parent", () => {
    const t: TreeNode[] = [n("first"), n("docs", [n("cv"), n("notes")]), n("misc")];
    const r = target(t, ["docs"], "first", "cv", 0)!;
    expect(r).toMatchObject({ parentId: "docs", index: 1 });
  });

  it("the depth is still limited by the neighbours", () => {
    // between cv and notes (both depth 1) a root cannot go back to depth 0 ...
    const left = target(docsTree(), docsOpen, "misc", "notes", -IND * 4)!;
    expect(left).toMatchObject({ parentId: "docs", index: 1 });
    expect(left.projection.depth).toBe(1);
    // ... nor deeper than cv + 1 (nested under cv)
    const right = target(docsTree(), docsOpen, "misc", "notes", IND * 4)!;
    expect(right).toMatchObject({ parentId: "cv", index: 0 });
    expect(right.projection.depth).toBe(2);
  });

  it("returns null for unknown ids and out-of-range rows", () => {
    const flat = flattenTree(tree(), new Set(open));
    expect(getDropTarget(flat, "nope", 0, 0, IND)).toBeNull();
    expect(getDropTarget(flat, "A", 99, 0, IND)).toBeNull();
    expect(getDropTarget(flat, "A", -1, 0, IND)).toBeNull();
  });

  it("does not crash with duplicate ids", () => {
    const t: TreeNode[] = [n("A"), n("A"), n("B")];
    const flat = flattenTree(t, new Set());
    expect(() => getDropTarget(flat, "A", 2, IND, IND)).not.toThrow();
  });
});

describe("projection cache", () => {
  it("does not recompute while the row and the indentation steps stay the same", () => {
    const cache = createProjectionCache<number, string>();
    const compute = vi.fn(() => Math.random());
    const first = cache.get("X", 3, 1, compute);
    // pointer wiggles by a few pixels: same row, same derived depth
    expect(cache.get("X", 3, 1, compute)).toBe(first);
    expect(cache.get("X", 3, 1, compute)).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes when the row or the steps change", () => {
    const cache = createProjectionCache<string, string>();
    const compute = vi.fn(() => "x");
    cache.get("X", 3, 1, compute);
    cache.get("X", 4, 1, compute);
    cache.get("X", 4, 2, compute);
    cache.get("X", 4, 2, compute);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("caches a null result too", () => {
    const cache = createProjectionCache<null, string>();
    const compute = vi.fn(() => null);
    cache.get("X", 0, 0, compute);
    cache.get("X", 0, 0, compute);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("does not share a result between two drags of different nodes (same row, same steps)", () => {
    const cache = createProjectionCache<string, string>();
    expect(cache.get("C1", 2, 0, () => "result for C1")).toBe("result for C1");
    // a later drag of another node over the same row and steps must be computed afresh
    expect(cache.get("B", 2, 0, () => "result for B")).toBe("result for B");
    // and coming back to the first node does not resurrect the stale entry either
    expect(cache.get("C1", 2, 0, () => "fresh C1")).toBe("fresh C1");
  });
});
