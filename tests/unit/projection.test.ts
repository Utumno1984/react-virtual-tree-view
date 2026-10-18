import { describe, expect, it, vi } from "vitest";
import type { TreeNode } from "../../src";
import { flattenTree, getDropTarget, moveNode } from "../../src";
import type { DropZone } from "../../src";
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

function target(
  t: TreeNode[],
  expanded: string[],
  activeId: string,
  overId: string,
  zone: DropZone,
  maxDepth?: number,
  hideActiveChildren = true,
) {
  const open = new Set(expanded);
  if (hideActiveChildren) open.delete(activeId);
  const flat = flattenTree(t, open);
  return getDropTarget(
    flat,
    activeId,
    flat.findIndex((x) => x.id === overId),
    zone,
    maxDepth,
  );
}
const open = ["p", "C"];

/** Result of really applying the drop: ids of the parent's children after the move. */
function childrenAfter(t: TreeNode[], activeId: string, r: { parentId: string | number | null; index: number }) {
  const moved = moveNode(t, activeId, r.parentId, r.index).tree;
  const siblings = r.parentId === null ? moved : findIn(moved, r.parentId)!.children!;
  return siblings.map((x) => x.id);
}
function findIn(nodes: TreeNode[], id: string | number): TreeNode | undefined {
  for (const x of nodes) {
    if (x.id === id) return x;
    const f = findIn(x.children ?? [], id);
    if (f) return f;
  }
  return undefined;
}

describe("getDropTarget: zones of the hovered row", () => {
  it("upper band: previous sibling of the hovered row", () => {
    const r = target(tree(), open, "D", "B", "before")!;
    expect(r).toMatchObject({ parentId: "p", index: 1, isNoop: false });
    expect(r.projection).toMatchObject({ depth: 1, zone: "before" });
    expect(r.slot).toBe(2); // line above B's row
    expect(childrenAfter(tree(), "D", r)).toEqual(["A", "D", "B", "C"]);
  });

  it("lower band: next sibling of the hovered row", () => {
    const r = target(tree(), open, "D", "A", "after")!;
    expect(r).toMatchObject({ parentId: "p", index: 1, isNoop: false });
    expect(r.projection).toMatchObject({ depth: 1, zone: "after" });
    expect(r.slot).toBe(2); // line below A's row
    expect(childrenAfter(tree(), "D", r)).toEqual(["A", "D", "B", "C"]);
  });

  it("middle band: child of the hovered row, as its FIRST child", () => {
    const r = target(tree(), open, "D", "B", "inside")!;
    expect(r).toMatchObject({ parentId: "B", index: 0, isNoop: false });
    expect(r.projection).toMatchObject({ depth: 2, zone: "inside" });
    expect(r.slot).toBe(2); // the hovered row is the one highlighted
    const moved = moveNode(tree(), "D", r.parentId, r.index).tree;
    expect(findIn(moved, "B")!.children!.map((x) => x.id)).toEqual(["D"]);
  });

  it("middle band of an expanded parent puts the node before the existing children", () => {
    const r = target(tree(), open, "A", "C", "inside")!;
    expect(r).toMatchObject({ parentId: "C", index: 0 });
    expect(childrenAfter(tree(), "A", r)).toEqual(["A", "c1"]);
  });

  it("middle band of a collapsed parent with hidden children still inserts first", () => {
    const t: TreeNode[] = [n("A", [n("a1"), n("a2")]), n("B")];
    const r = target(t, [], "B", "A", "inside")!;
    expect(r).toMatchObject({ parentId: "A", index: 0 });
    expect(childrenAfter(t, "B", r)).toEqual(["B", "a1", "a2"]);
  });

  it("middle band of a leaf makes it a parent", () => {
    const t: TreeNode[] = [n("A"), n("B")];
    const r = target(t, [], "B", "A", "inside")!;
    expect(r).toMatchObject({ parentId: "A", index: 0 });
    expect(moveNode(t, "B", r.parentId, r.index).tree).toEqual([n("A", [n("B")])]);
  });

  it("lower band of an expanded row with visible children is its FIRST child, line right below the row", () => {
    const r = target(tree(), open, "A", "C", "after")!;
    expect(r).toMatchObject({ parentId: "C", index: 0, isNoop: false });
    // C is row 3: the line is above row 4 (c1), adjacent to C
    expect(r.slot).toBe(4);
    expect(r.projection).toMatchObject({ depth: 2, zone: "after", parentId: "C" });
    expect(childrenAfter(tree(), "A", r)).toEqual(["A", "c1"]);
  });

  it("lower band of a collapsed row or a leaf is still the next sibling", () => {
    const collapsed = target(tree(), ["p"], "A", "C", "after")!;
    expect(collapsed).toMatchObject({ parentId: "p", index: 2, slot: 4 });
    expect(collapsed.projection.depth).toBe(1);
    expect(target(tree(), open, "A", "c1", "after")).toMatchObject({ parentId: "C", index: 1, slot: 5 });
  });

  it("a very long expanded subtree: the lower band keeps the line adjacent to the row", () => {
    const kids = Array.from({ length: 200 }, (_, i) => n(`k${i}`));
    const t: TreeNode[] = [n("P", kids), n("Q"), n("X")];
    const r = target(t, ["P"], "X", "P", "after")!;
    expect(r).toMatchObject({ parentId: "P", index: 0, slot: 1 });
    expect(r.projection.depth).toBe(1);
    // the next sibling position stays reachable from the last child's row / the next row's top
    expect(target(t, ["P"], "X", "Q", "before")).toMatchObject({ parentId: null, index: 1, slot: 201 });
  });

  it("the lower band of an expanded row respects maxDepth as a child (invalid, not demoted)", () => {
    // C is at depth 1 with a visible child: its first-child zone is depth 2
    expect(target(tree(), open, "A", "C", "after", 2)).toMatchObject({ parentId: "C", index: 0 });
    expect(target(tree(), open, "A", "C", "after", 1)).toBeNull();
    // p (depth 0) with maxDepth 1: a height-1 node (C) may not be its first child via the lower band
    expect(target(tree(), open, "C", "p", "after", 1)).toBeNull();
  });

  it("the dragged node as first child of an expanded row: the lower band is a no-op", () => {
    expect(target(tree(), open, "A", "p", "after")).toMatchObject({ parentId: "p", index: 0, slot: 1, isNoop: true });
    expect(target(tree(), open, "B", "p", "after")).toMatchObject({ parentId: "p", index: 0, isNoop: false });
  });

  it("returns null for a zero, NaN or fractional row index", () => {
    const flat = flattenTree(tree(), new Set(open));
    expect(getDropTarget(flat, "A", Number.NaN, "inside")).toBeNull();
    expect(getDropTarget(flat, "A", 1.5, "inside")).toBeNull();
  });

  it("upper band of the first row and lower band of the last row work at the margins", () => {
    const first = target(tree(), open, "q", "p", "before")!;
    expect(first).toMatchObject({ parentId: null, index: 0, slot: 0 });
    expect(childrenAfter(tree(), "q", first)).toEqual(["q", "p"]);
    const last = target(tree(), open, "A", "q", "after")!;
    expect(last).toMatchObject({ parentId: null, index: 2, slot: 7 });
    // first / last child of a group
    const firstChild = target(tree(), open, "D", "A", "before")!;
    expect(firstChild).toMatchObject({ parentId: "p", index: 0 });
    const lastChild = target(tree(), open, "A", "D", "after")!;
    expect(lastChild).toMatchObject({ parentId: "p", index: 3 });
  });

  it("the horizontal position does not matter: the same row and zone always give the same target", () => {
    // There is no dx parameter any more: the target is a function of (row, zone) only.
    const a = target(tree(), open, "B", "D", "before");
    const b = target(tree(), open, "B", "D", "before");
    expect(a).toEqual(b);
  });

  it("a node moved to another level carries its descendants", () => {
    const t: TreeNode[] = [n("A"), n("C", [n("c1", [n("c2")])])];
    const r = target(t, ["C", "c1"], "C", "A", "inside")!;
    expect(r.parentId).toBe("A");
    const result = moveNode(t, "C", r.parentId, r.index).tree;
    const flat = flattenTree(result, new Set(["A", "C", "c1"]));
    expect(flat.map((x) => [x.id, x.depth])).toEqual([
      ["A", 0],
      ["C", 1],
      ["c1", 2],
      ["c2", 3],
    ]);
  });
});

describe("getDropTarget: invalid targets", () => {
  it("the dragged node is never a target, in any zone", () => {
    for (const zone of ["before", "inside", "after"] as const) {
      expect(target(tree(), open, "B", "B", zone)).toBeNull();
    }
  });

  it("a descendant of the dragged node is not a target even when it is in the list", () => {
    // C is dragged but its child is still in the list (hideActiveChildren = false)
    for (const zone of ["before", "inside", "after"] as const) {
      expect(target(tree(), open, "C", "c1", zone, undefined, false)).toBeNull();
    }
    // the row after the subtree is valid again
    expect(target(tree(), open, "C", "D", "before", undefined, false)).not.toBeNull();
  });

  it("the dragged node's descendants are not in the list while dragging", () => {
    const flat = flattenTree(tree(), new Set(["p"]));
    expect(flat.map((x) => x.id)).not.toContain("c1");
    // and moveNode refuses a move into a descendant anyway
    expect(moveNode(tree(), "C", "c1", 0).tree).toEqual(tree());
  });

  it("returns null for unknown ids, out-of-range rows and an empty list", () => {
    const flat = flattenTree(tree(), new Set(open));
    expect(getDropTarget(flat, "nope", 0, "before")).toBeNull();
    expect(getDropTarget(flat, "A", 99, "before")).toBeNull();
    expect(getDropTarget(flat, "A", -1, "before")).toBeNull();
    expect(getDropTarget([], "X", 0, "inside")).toBeNull();
  });

  it("a single node has nothing to drop on", () => {
    expect(target([n("X")], [], "X", "X", "inside")).toBeNull();
  });

  it("does not crash with duplicate ids", () => {
    const t: TreeNode[] = [n("A"), n("A"), n("B")];
    const flat = flattenTree(t, new Set());
    expect(() => getDropTarget(flat, "A", 2, "inside")).not.toThrow();
  });
});

describe("getDropTarget: isNoop", () => {
  it("the lower band of the previous sibling and the upper band of the next one change nothing", () => {
    expect(target(tree(), open, "B", "A", "after")!.isNoop).toBe(true);
    expect(target(tree(), open, "B", "C", "before")!.isNoop).toBe(true);
  });

  it("the first child dropped as first child of its own parent is a no-op", () => {
    expect(target(tree(), open, "A", "p", "inside")).toMatchObject({ parentId: "p", index: 0, isNoop: true });
    // any other child is not
    expect(target(tree(), open, "B", "p", "inside")).toMatchObject({ index: 0, isNoop: false });
  });

  it("an only child dropped next to its parent's level or inside its parent differently is not a no-op", () => {
    const t: TreeNode[] = [n("p", [n("A"), n("C", [n("C1")]), n("D")])];
    expect(target(t, ["p", "C"], "C1", "C", "inside")).toMatchObject({ parentId: "C", index: 0, isNoop: true });
    // the lower band of expanded C is its first-child zone, which is where C1 already is
    expect(target(t, ["p", "C"], "C1", "C", "after")).toMatchObject({ parentId: "C", index: 0, isNoop: true });
    expect(target(t, ["p", "C"], "C1", "D", "before")).toMatchObject({ parentId: "p", index: 2, isNoop: false });
  });

  it("the first root after itself is a no-op, the last root before itself too", () => {
    expect(target(tree(), open, "p", "q", "before")!.isNoop).toBe(true);
    // p collapsed: its lower band is "next sibling", which is where q already is
    expect(target(tree(), [], "q", "p", "after")!.isNoop).toBe(true);
    // p expanded: the lower band is its first-child zone
    expect(target(tree(), open, "q", "p", "after")).toMatchObject({ parentId: "p", index: 0, isNoop: false });
  });

  it("two drags over the same row and zone give different targets for different dragged nodes", () => {
    const t: TreeNode[] = [n("p", [n("A"), n("B"), n("C", [n("C1")])])];
    const first = target(t, ["p", "C"], "C1", "B", "before")!;
    const second = target(t, ["p", "C"], "B", "A", "after")!;
    expect(first.isNoop).toBe(false);
    expect(first.parentId).toBe("p");
    expect(second.isNoop).toBe(true);
  });
});

describe("getDropTarget: disabled nodes", () => {
  it("a disabled row accepts children and siblings (isDisabled only blocks dragging it)", () => {
    const t: TreeNode[] = [n("A", undefined, true), n("B")];
    const child = target(t, [], "B", "A", "inside")!;
    expect(child.parentId).toBe("A");
    expect(moveNode(t, "B", child.parentId, child.index).tree[0]!.children).toEqual([n("B")]);
    expect(target(t, [], "B", "A", "before")).toMatchObject({ parentId: null, index: 0 });
    expect(target(t, [], "B", "A", "after")).toMatchObject({ parentId: null, index: 1, isNoop: true });
  });
});

describe("getDropTarget: maxDepth and the dragged subtree", () => {
  it("refuses the child zone of a row at the limit, keeps its sibling zones", () => {
    // c1 is at depth 2; maxDepth 2 -> a leaf may be its sibling but not its child
    expect(target(tree(), open, "A", "c1", "inside", 2)).toBeNull();
    expect(target(tree(), open, "A", "c1", "before", 2)).toMatchObject({ parentId: "C" });
    expect(target(tree(), open, "A", "c1", "after", 2)).toMatchObject({ parentId: "C" });
  });

  it("accounts for the height of the dragged subtree (getSubtreeHeight)", () => {
    // C (height 1) cannot become a child of B (depth 1) with maxDepth 2: c1 would be at 3
    expect(target(tree(), open, "C", "B", "inside", 2)).toBeNull();
    expect(target(tree(), open, "C", "B", "before", 2)).not.toBeNull();
    // q has height 0: a child of B is fine
    expect(target(tree(), open, "q", "B", "inside", 2)).not.toBeNull();
  });
});

describe("projection cache", () => {
  it("does not recompute while the row and the zone stay the same", () => {
    const cache = createProjectionCache<number, string, string>();
    const compute = vi.fn(() => Math.random());
    const first = cache.get("X", 3, "inside", compute);
    // pointer wiggles by a few pixels: same row, same zone
    expect(cache.get("X", 3, "inside", compute)).toBe(first);
    expect(cache.get("X", 3, "inside", compute)).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes when the row or the zone change", () => {
    const cache = createProjectionCache<string, string, string>();
    const compute = vi.fn(() => "x");
    cache.get("X", 3, "before", compute);
    cache.get("X", 4, "before", compute);
    cache.get("X", 4, "inside", compute);
    cache.get("X", 4, "inside", compute);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("caches a null result too", () => {
    const cache = createProjectionCache<null, string, string>();
    const compute = vi.fn(() => null);
    cache.get("X", 0, "after", compute);
    cache.get("X", 0, "after", compute);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("does not share a result between two drags of different nodes (same row, same zone)", () => {
    const cache = createProjectionCache<string, string, string>();
    expect(cache.get("C1", 2, "before", () => "result for C1")).toBe("result for C1");
    // a later drag of another node over the same row and zone must be computed afresh
    expect(cache.get("B", 2, "before", () => "result for B")).toBe("result for B");
    // and coming back to the first node does not resurrect the stale entry either
    expect(cache.get("C1", 2, "before", () => "fresh C1")).toBe("fresh C1");
  });
});
