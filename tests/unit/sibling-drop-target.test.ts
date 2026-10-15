import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";
import { flattenTree, getSiblingDropTarget, moveNode } from "../../src";

const n = (id: string, children?: TreeNode[]): TreeNode => ({
  id,
  label: id,
  ...(children ? { children } : {}),
});

// p
//   A
//   B
//   C
//     c1
//   D
// q
//   E
const tree = (): TreeNode[] => [
  n("p", [n("A"), n("B"), n("C", [n("c1")]), n("D")]),
  n("q", [n("E")]),
];
const expandAll = new Set(["p", "q", "C"]);
const flat = (t = tree()) => flattenTree(t, expandAll);
const indexOf = (id: string, f = flat()) => f.findIndex((x) => x.id === id);

describe("getSiblingDropTarget", () => {
  it("moving A down over C gives index 2 under p (order B, C, A)", () => {
    const f = flat();
    const target = getSiblingDropTarget(f, "A", indexOf("C", f));
    expect(target).toEqual({ parentId: "p", index: 2 });
    const t = tree();
    const moved = moveNode(t, "A", target!.parentId, target!.index);
    expect(moved.tree[0]!.children!.map((c) => c.id)).toEqual(["B", "C", "A", "D"]);
    expect(moved.index).toBe(2);
  });

  it("moving up inserts at the over sibling's position", () => {
    const f = flat();
    expect(getSiblingDropTarget(f, "D", indexOf("B", f))).toEqual({ parentId: "p", index: 1 });
  });

  it("returns null when dropping on the node itself", () => {
    const f = flat();
    expect(getSiblingDropTarget(f, "B", indexOf("B", f))).toBeNull();
  });

  it("maps the children of an expanded sibling to that sibling", () => {
    const f = flat();
    expect(getSiblingDropTarget(f, "A", indexOf("c1", f))).toEqual({ parentId: "p", index: 2 });
  });

  it("returns null for rows of another parent or a shallower level", () => {
    const f = flat();
    expect(getSiblingDropTarget(f, "A", indexOf("E", f))).toBeNull();
    expect(getSiblingDropTarget(f, "A", indexOf("q", f))).toBeNull();
    expect(getSiblingDropTarget(f, "c1", indexOf("A", f))).toBeNull();
  });

  it("handles root-level siblings with parentId null", () => {
    const f = flat();
    expect(getSiblingDropTarget(f, "p", indexOf("E", f))).toEqual({ parentId: null, index: 1 });
  });

  it("returns null for unknown ids and out-of-range indexes", () => {
    const f = flat();
    expect(getSiblingDropTarget(f, "nope", 0)).toBeNull();
    expect(getSiblingDropTarget(f, "A", -1)).toBeNull();
    expect(getSiblingDropTarget(f, "A", f.length)).toBeNull();
    expect(getSiblingDropTarget([], "A", 0)).toBeNull();
  });

  it("does not crash with duplicate ids", () => {
    const dup = [n("x"), n("y"), n("x")];
    const f = flattenTree(dup, new Set());
    expect(() => getSiblingDropTarget(f, "x", 1)).not.toThrow();
  });
});
